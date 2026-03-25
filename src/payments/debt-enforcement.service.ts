import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService, TransactionType } from './wallet.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';

@Injectable()
export class DebtEnforcementService {
  private readonly logger = new Logger(DebtEnforcementService.name);
  private readonly HOTEL_DEBT_GRACE_PERIOD_DAYS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly notificationsService: CommonNotificationsService,
  ) {}

  /**
   * Daily cron job: Check and enforce 15-day-old driver commission debts
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async enforceOverdueDebts(): Promise<void> {
    this.logger.log('Starting debt enforcement check...');

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
   * Hourly cron job: Check and enforce hotel manager debts
   */
  @Cron('0 * * * *') // Every hour
  async enforceHotelDebts(): Promise<void> {
    this.logger.log('Starting hotel debt enforcement check...');

    try {
      // 1. Attempt immediate recovery
      await this.attemptHotelDebtRecovery();

      // 2. Send warnings for overdue debts
      await this.sendDebtWarnings();

      // 3. Suspend managers after grace period
      await this.suspendOverdueManagers();

      // 4. Auto-reactivate managers who cleared debts
      await this.reactivateClearedManagers();

      this.logger.log('Hotel debt enforcement completed');
    } catch (error) {
      this.logger.error(
        'Error in enforceHotelDebts:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Attempt to recover hotel debts if manager has available funds
   */
  private async attemptHotelDebtRecovery(): Promise<void> {
    // Get all pending hotel debts from wallet transactions
    const hotelDebtTransactions = await this.prisma.walletTransaction.findMany({
      where: {
        type: TransactionType.HOTEL_DEBT,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    for (const transaction of hotelDebtTransactions) {
      try {
        const { wallet } = transaction;
        const metadata = transaction.metadata as any;
        
        // Skip if already recovered or not pending
        if (metadata?.status !== 'pending') continue;

        const debtAmount = -(transaction.amount); // Amount is negative for debts

        // Calculate available balance
        const available = wallet.balance - wallet.reserved - wallet.locked;

        if (available >= debtAmount) {
          // Auto-recover: deduct from wallet
          await this.walletService.forceDeductForDebt(
            wallet.id,
            debtAmount,
            {
              originalTransaction: transaction.id,
              recoveredAt: new Date(),
              recoveryType: 'immediate',
            },
          );

          // Update metadata to mark as recovered
          await this.prisma.walletTransaction.update({
            where: { id: transaction.id },
            data: {
              metadata: {
                ...metadata,
                status: 'recovered',
                recoveredAt: new Date(),
                recoveryType: 'immediate',
              },
            },
          });

          // Send notification
          await this.notificationsService.createNotification(
            wallet.user_id,
            'payment_received',
            'Hotel Booking Debt Collected',
            `Hotel booking debt of PKR ${(debtAmount / 100n).toString()} was automatically deducted from your wallet.`,
            { transactionId: transaction.id, amount: debtAmount.toString() },
          );

          this.logger.log(`Hotel debt recovered for user ${wallet.user_id}`);
        }
      } catch (error) {
        this.logger.error('Error attempting hotel debt recovery:', error instanceof Error ? error.message : 'Unknown');
      }
    }
  }

  /**
   * Send warnings for debts in grace period
   */
  private async sendDebtWarnings(): Promise<void> {
    const now = new Date();

    const hotelDebtTransactions = await this.prisma.walletTransaction.findMany({
      where: {
        type: TransactionType.HOTEL_DEBT,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    for (const transaction of hotelDebtTransactions) {
      try {
        const metadata = transaction.metadata as any;
        
        // Already warned or recovered
        if (metadata?.warningSentAt || metadata?.status === 'recovered') continue;

        const dueDate = new Date(metadata?.dueAt || now);

        // If past due date and not yet warned, send warning
        if (dueDate < now && !metadata?.warningSentAt) {
          const graceUntil = new Date(dueDate.getTime() + this.HOTEL_DEBT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

          await this.notificationsService.createNotification(
            transaction.wallet.user_id,
            'dispute_warning',
            'Hotel Booking Debt Payment Due',
            `Your hotel booking debt  of PKR ${Math.abs(Number(transaction.amount)) / 100} is overdue. Payment due by ${graceUntil.toLocaleDateString()}. Account suspension will follow non-payment.`,
            {
              transactionId: transaction.id,
              dueAt: metadata?.dueAt,
              gracePeriodUntil: graceUntil.toISOString(),
            },
          );

          // Update metadata
          await this.prisma.walletTransaction.update({
            where: { id: transaction.id },
            data: {
              metadata: {
                ...metadata,
                warningSentAt: now,
                gracePeriodUntil: graceUntil.toISOString(),
              },
            },
          });

          this.logger.log(`Warning sent for hotel debt ${transaction.id}`);
        }
      } catch (error) {
        this.logger.error('Error sending debt warning:', error instanceof Error ? error.message : 'Unknown');
      }
    }
  }

  /**
   * Suspend managers after grace period expires
   */
  private async suspendOverdueManagers(): Promise<void> {
    const now = new Date();
    const managersToSuspend = new Set<number>();

    const hotelDebtTransactions = await this.prisma.walletTransaction.findMany({
      where: {
        type: TransactionType.HOTEL_DEBT,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    for (const transaction of hotelDebtTransactions) {
      const metadata = transaction.metadata as any;
      
      // Skip if recovered or already suspended
      if (metadata?.status === 'recovered' || metadata?.suspended) continue;

      if (metadata?.gracePeriodUntil) {
        const gracePeriodEnd = new Date(metadata.gracePeriodUntil);
        if (gracePeriodEnd < now) {
          managersToSuspend.add(transaction.wallet.user_id);
        }
      }
    }

    // Suspend managers
    for (const managerId of Array.from(managersToSuspend)) {
      try {
        await this.prisma.user.update({
          where: { id: managerId },
          data: { status: 'inactive' },
        });

        await this.notificationsService.createNotification(
          managerId,
          'suspension_started',
          'Account Suspended',
          'Your hotel manager account has been suspended due to unpaid hotel booking debt. Please settle outstanding debts to restore access.',
          { reason: 'unpaid_hotel_debt', suspendedAt: now.toISOString() },
        );

        this.logger.log(`Hotel manager ${managerId} suspended due to overdue debt`);
      } catch (error) {
        this.logger.error(`Error suspending manager ${managerId}:`, error instanceof Error ? error.message : 'Unknown');
      }
    }
  }

  /**
   * Auto-reactivate managers who have cleared all hotel debts
   */
  private async reactivateClearedManagers(): Promise<void> {
    const inactiveManagers = await this.prisma.user.findMany({
      where: {
        status: 'inactive',
        role: 'hotel_manager',
        hotelManager: {
          isNot: null,
        },
      },
      select: { id: true },
    });

    for (const manager of inactiveManagers) {
      try {
        // Check if they have pending hotel debts
        const pendingDebts = await this.prisma.walletTransaction.findMany({
          where: {
            wallet: {
              user_id: manager.id,
            },
            type: TransactionType.HOTEL_DEBT,
          },
        });

        // Filter to only pending/unrecovered debts
        const unresolvedDebts = pendingDebts.filter((debt) => {
          const metadata = debt.metadata as any;
          return metadata?.status === 'pending' || (!metadata?.status && metadata?.dueAt);
        });

        // If no unresolved debts, reactivate
        if (unresolvedDebts.length === 0) {
          await this.prisma.user.update({
            where: { id: manager.id },
            data: { status: 'active' },
          });

          await this.notificationsService.createNotification(
            manager.id,
            'suspension_started',
            'Account Reactivated',
            'Your hotel manager account has been reactivated. All outstanding debts have been resolved.',
            { reactivatedAt: new Date().toISOString() },
          );

          this.logger.log(`Hotel manager ${manager.id} reactivated after debt clearance`);
        }
      } catch (error) {
        this.logger.error(`Error checking manager ${manager.id} for reactivation:`, error instanceof Error ? error.message : 'Unknown');
      }
    }
  }

  /**
   * Enforce a single driver commission debt
   */
  private async enforceDebt(debtId: string, driverId: number): Promise<void> {
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
      this.logger.warn(
        `Driver ${driverId} has insufficient balance for debt ${debtId}. Available: ${available}, Owed: ${debtAmount}`,
      );
    }
  }

  /**
   * Manual debt enforcement trigger
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
   * Get all overdue debts
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
    });
  }

  /**
   * Process annual renewal fees
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
          await this.walletService.deductBalance(
            wallet.id,
            feeAmount,
            TransactionType.RENEWAL_FEE,
            { renewalFeeId: fee.id },
          );

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
