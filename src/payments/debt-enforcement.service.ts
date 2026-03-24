import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService, TransactionType } from './wallet.service';

@Injectable()
export class DebtEnforcementService {
  private readonly logger = new Logger(DebtEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Daily cron job: Check and enforce 15-day-old debts
   * Runs at 00:00 UTC every day
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async enforceOverdueDebts(): Promise<void> {
    this.logger.log('Starting 15-day debt enforcement check...');

    try {
      const today = new Date();
      const fifteenDaysAgo = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000);

      // Find all debts due and not paid
      const overdueDebts = await this.prisma.commissionDebt.findMany({
        where: {
          status: 'pending',
          due_date: {
            lte: fifteenDaysAgo,
          },
        },
        include: {
          driver: true,
        },
      });

      this.logger.log(`Found ${overdueDebts.length} overdue debts to enforce`);

      for (const debt of overdueDebts) {
        try {
          await this.enforceDebt(debt.id, debt.driver_id);
        } catch (error) {
          this.logger.error(
            `Failed to enforce debt ${debt.id}:`,
            error instanceof Error ? error.message : 'Unknown error',
          );
          // Continue with next debt
        }
      }

      this.logger.log('Debt enforcement check completed');
    } catch (error) {
      this.logger.error(
        'Error in enforceOverdueDebts:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Enforce a single debt
   * Auto-deduct from driver wallet if balance available
   */
  async enforceDebt(debtId: string, driverId: number): Promise<void> {
    const debt = await this.prisma.commissionDebt.findUnique({
      where: { id: debtId },
    });

    if (!debt || debt.status !== 'pending') {
      return;
    }

    // Get driver wallet
    const wallet = await this.prisma.wallet.findFirst({
      where: { user_id: driverId, userType: 'driver' },
    });

    if (!wallet) {
      this.logger.warn(`No wallet found for driver ${driverId}`);
      return;
    }

    // Calculate available balance
    const available = wallet.balance - wallet.reserved - wallet.locked;
    const debtAmount = BigInt(debt.amount.toString());

    if (available >= debtAmount) {
      // Balance is sufficient - deduct automatically
      await this.walletService.deductBalance(
        wallet.id,
        debtAmount,
        TransactionType.DEBT_REPAYMENT,
        { debtId, enforcedAt: new Date() },
      );

      // Mark debt as paid
      await this.prisma.commissionDebt.update({
        where: { id: debtId },
        data: {
          status: 'paid',
          paid_at: new Date(),
        },
      });

      this.logger.log(`Debt ${debtId} auto-deducted and marked paid`);
    } else {
      // Insufficient balance - flag for manual intervention
      this.logger.warn(
        `Driver ${driverId} has insufficient balance for debt ${debtId}. ` +
          `Available: ${available}, Owed: ${debtAmount}`,
      );

      // Could send notification to driver here
      // Could mark debt with a flag for review
    }
  }

  /**
   * Manual debt enforcement trigger (for tests/admin)
   */
  async triggerManualEnforcement(debtId: string): Promise<{ enforced: boolean; reason?: string }> {
    const debt = await this.prisma.commissionDebt.findUnique({
      where: { id: debtId },
    });

    if (!debt) {
      return { enforced: false, reason: 'Debt not found' };
    }

    try {
      await this.enforceDebt(debtId, debt.driver_id);
      return { enforced: true };
    } catch (error) {
      return {
        enforced: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all overdue debts (> 15 days old)
   */
  async getOverdueDebts(driverId?: number): Promise<any[]> {
    const today = new Date();
    const fifteenDaysAgo = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000);

    const where: any = {
      status: 'pending',
      due_date: {
        lte: fifteenDaysAgo,
      },
    };

    if (driverId) {
      where.driver_id = driverId;
    }

    return this.prisma.commissionDebt.findMany({
      where,
      orderBy: { due_date: 'asc' },
      include: {
        driver: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Renewal fee check (annual/monthly)
   * Could be called by separate cron if needed
   */
  async processAnnualRenewalFees(): Promise<number> {
    const fees = await this.prisma.renewalFee.findMany({
      where: {
        status: 'pending',
        due_date: {
          lte: new Date(),
        },
      },
      include: {
        driver: true,
      },
    });

    let processed = 0;

    for (const fee of fees) {
      try {
        const wallet = await this.prisma.wallet.findFirst({
          where: { user_id: fee.driver_id, userType: 'driver' },
        });

        if (!wallet) {
          continue;
        }

        const feeAmount = BigInt(fee.amount.toString());
        const available = wallet.balance - wallet.reserved - wallet.locked;

        if (available >= feeAmount) {
          // Deduct renewal fee
          await this.walletService.deductBalance(
            wallet.id,
            feeAmount,
            TransactionType.RENEWAL_FEE,
            { renewalFeeId: fee.id },
          );

          // Mark as paid
          await this.prisma.renewalFee.update({
            where: { id: fee.id },
            data: {
              status: 'paid',
              paid_at: new Date(),
            },
          });

          processed++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to process renewal fee ${fee.id}:`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }

    this.logger.log(`Processed ${processed} renewal fees`);
    return processed;
  }
}
