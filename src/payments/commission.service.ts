import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionDebt } from '@prisma/client';
import { WalletService, TransactionType } from './wallet.service';
import { COMMISSION_POLICY } from '../common/utils/constants';

@Injectable()
export class CommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * ONLINE PAYMENT: Immediate commission deduction
   * 15% total (85% net commission + 15% tax reserve)
   * = 12.75% net commission + 2.25% tax reserve
   */
  async processOnlineCommission(
    bookingId: number,
    finalAmountInPaisa: bigint,
  ): Promise<{
    platformCommission: bigint;
    taxReserve: bigint;
    totalCommission: bigint;
  }> {
    // Get booking details
    const booking = await this.prisma.carBooking.findUnique({
      where: { id: bookingId },
       include: {
         car: {
           include: {
             driver: {
               include: { user: true },
             },
           },
         },
       },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

      const car = booking.car;
      const driver = car?.driver;
    if (!driver?.user) {
      throw new BadRequestException('Driver not found for booking');
    }

    // Ensure driver wallet exists
    const wallet = await this.walletService.ensureWallet(driver.user.id, 'driver');

    // Calculate commission breakdown
    const platformCommission = this.calculatePlatformCommission(finalAmountInPaisa);
    const taxReserve = this.calculateTaxReserve(finalAmountInPaisa);
    const totalCommission = platformCommission + taxReserve;

    // Deduct platform commission immediately
    await this.walletService.deductBalance(
      wallet.id,
      platformCommission,
      TransactionType.COMMISSION,
      {
        bookingId,
        type: 'platform_commission',
        finalAmount: finalAmountInPaisa.toString(),
      },
    );

    // Reserve tax (keep in wallet as reserved, not deducted)
    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        reserved: {
          increment: taxReserve,
        },
      },
    });

    // Record tax reserve transaction
    await this.walletService.recordTransaction(
      wallet.id,
      TransactionType.TAX_RESERVE,
      taxReserve,
      { bookingId, finalAmount: finalAmountInPaisa.toString() },
    );

    return {
      platformCommission,
      taxReserve,
      totalCommission,
    };
  }

  /**
   * CASH PAYMENT: Create debt record
   * 15% total owed by driver/provider
   * Due date: check-in + 30 days for hotel, 15 days for driver
   */
  async processCashBooking(
    bookingId: number,
    driverId: number,
    finalAmountInPaisa: bigint,
    daysUntilDue: number = 15,
  ): Promise<CommissionDebt> {
    // Ensure wallet exists for driver
    await this.walletService.ensureWallet(driverId, 'driver');

    // Calculate commission (15% total)
    const commissionInPaisa = this.calculateTotalCommission(finalAmountInPaisa);

    // Create debt record
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysUntilDue);

    const debt = await this.prisma.commissionDebt.create({
      data: {
        driver_id: driverId,
        booking_id: bookingId,
        amount: commissionInPaisa,
        status: 'pending',
        due_date: dueDate,
      },
    });

    return debt;
  }

  /**
   * DEBT SETTLEMENT: Mark debt as paid when driver pays
   */
  async settleDebt(
    debtId: string,
    paymentAmountInPaisa: bigint,
  ): Promise<CommissionDebt> {
    const debt = await this.prisma.commissionDebt.findUnique({
      where: { id: debtId },
    });

    if (!debt) {
      throw new NotFoundException('Debt not found');
    }

    if (BigInt(debt.amount.toString()) !== paymentAmountInPaisa) {
      throw new BadRequestException('Payment amount does not match debt');
    }

    // Mark as paid
    const updated = await this.prisma.commissionDebt.update({
      where: { id: debtId },
      data: {
        status: 'paid',
        paid_at: new Date(),
      },
    });

    // Deduct from driver wallet
    const wallet = await this.prisma.wallet.findFirst({
      where: { user_id: debt.driver_id, userType: 'driver' },
    });

    if (wallet) {
      await this.walletService.recordTransaction(
        wallet.id,
        TransactionType.DEBT_REPAYMENT,
        paymentAmountInPaisa,
        { debtId },
      );
    }

    return updated;
  }

  /**
   * Get all pending debts for a driver
   */
  async getDriverDebts(
    driverId: number,
    status: 'pending' | 'paid' | 'all' = 'pending',
  ): Promise<CommissionDebt[]> {
    const where: any = { driver_id: driverId };
    if (status !== 'all') {
      where.status = status;
    }

    return this.prisma.commissionDebt.findMany({
      where,
      orderBy: { due_date: 'asc' },
    });
  }

  /**
   * Get total pending debt for a driver
   */
  async getTotalPendingDebt(driverId: number): Promise<bigint> {
    const debts = await this.prisma.commissionDebt.findMany({
      where: {
        driver_id: driverId,
        status: 'pending',
      },
    });

    let total = 0n;
    for (const debt of debts) {
      total = total + BigInt(debt.amount.toString());
    }
    return total;
  }

  /**
   * Get commission breakdown for admin
   * Platform: 15% total (85% net commission + 15% tax reserve)
   */
  getCommissionBreakdown(): { platformShare: number; providerShare: number; netCommission: number; taxReserve: number } {
    return {
      platformShare: 15, // 15% of gross
      providerShare: 85, // 85% of gross
      netCommission: 12.75, // 85% of 15%
      taxReserve: 2.25, // 15% of 15%
    };
  }

  /**
   * Calculate net commission (12.75% of gross = 85% of platform's 15%)
   */
  private calculatePlatformCommission(finalAmountInPaisa: bigint): bigint {
    return (finalAmountInPaisa * 1275n) / 10000n; // 12.75%
  }

  /**
   * Calculate tax reserve (2.25% of gross = 15% of platform's 15%)
   */
  private calculateTaxReserve(finalAmountInPaisa: bigint): bigint {
    return (finalAmountInPaisa * 225n) / 10000n; // 2.25%
  }

  /**
   * Calculate total commission (15% of gross)
   */
  private calculateTotalCommission(finalAmountInPaisa: bigint): bigint {
    return (finalAmountInPaisa * 1500n) / 10000n; // 15%
  }
}
