import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService, TransactionType } from './wallet.service';
import { CommissionService } from './commission.service';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly commissionService: CommissionService,
    private readonly configService: ConfigService,
  ) {}

  private getStripeClient(): Stripe {
    if (this.stripe) {
      return this.stripe;
    }

    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new BadRequestException('Stripe is not configured on server');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    });

    return this.stripe;
  }

  /**
   * Initiate wallet topup
   * Creates WalletTopup record with pending status
   * (Stripe intent creation happens in frontend/separate service)
   */
  async initiateTopup(userId: number, userType: string, amountInPaisa: bigint) {
    const stripe = this.getStripeClient();

    // Ensure wallet exists
    const wallet = await this.walletService.ensureWallet(userId, userType);

    // Create topup request
    const topup = await this.prisma.walletTopup.create({
      data: {
        wallet_id: wallet.id,
        amount: amountInPaisa,
        status: 'pending',
      },
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const redirectBasePath =
      userType === 'driver'
        ? '/driver/payouts'
        : userType === 'hotel_manager'
          ? '/hotel-manager/earnings'
          : '/client/wallet';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'pkr',
            product_data: {
              name: 'TripVerse Wallet Topup',
              description: `Wallet topup for user #${userId}`,
            },
            unit_amount: Number(amountInPaisa),
          },
          quantity: 1,
        },
      ],
      metadata: {
        topupId: topup.id,
        userId: String(userId),
        userType,
      },
      success_url: `${frontendUrl}${redirectBasePath}?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}${redirectBasePath}?topup=cancelled`,
    });

    return {
      topupId: topup.id,
      amountInPaisa: topup.amount.toString(),
      status: topup.status,
      createdAt: topup.created_at,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
    };
  }

  async confirmTopupCheckoutSession(sessionId: string) {
    const stripe = this.getStripeClient();

    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      throw new BadRequestException('Stripe checkout session is not paid');
    }

    const topupId = session.metadata?.topupId;
    if (!topupId) {
      throw new BadRequestException('Missing topup reference in Stripe metadata');
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || session.id;

    const result = await this.completeTopup(topupId, paymentIntentId);
    return {
      topupId,
      paymentIntentId,
      ...result,
    };
  }

  /**
   * Complete topup after Stripe payment
   * Auto-deduct pending debts, then add balance
   */
  async completeTopup(
    topupId: string,
    stripePaymentIntentId: string,
  ): Promise<{ debtDeducted: string; finalAdded: string; alreadyProcessed?: boolean }> {
    const topup = await this.prisma.walletTopup.findUnique({
      where: { id: topupId },
    });

    if (!topup) {
      throw new NotFoundException('Topup not found');
    }

    if (topup.status === 'completed') {
      return {
        debtDeducted: '0',
        finalAdded: '0',
        alreadyProcessed: true,
      };
    }

    if (topup.status !== 'pending') {
      throw new BadRequestException(`Topup cannot be processed from status: ${topup.status}`);
    }

    // Atomic claim: only one caller can move pending -> processing.
    const claim = await this.prisma.walletTopup.updateMany({
      where: {
        id: topupId,
        status: 'pending',
      },
      data: {
        status: 'processing',
        stripe_payment_intent_id: stripePaymentIntentId,
      },
    });

    if (claim.count === 0) {
      const latest = await this.prisma.walletTopup.findUnique({ where: { id: topupId } });
      // If already completed or processing, return success (idempotent response)
      if (latest?.status === 'completed' || latest?.status === 'processing') {
        return {
          debtDeducted: '0',
          finalAdded: '0',
          alreadyProcessed: true,
        };
      }
      throw new BadRequestException('Topup cannot be processed');
    }

    try {
      // Auto-deduct pending debts, then add remaining topup amount.
      const result = await this.walletService.autoDeductPendingDebts(
        topup.wallet_id,
        BigInt(topup.amount.toString()),
      );

      // Mark topup as completed
      await this.prisma.walletTopup.update({
        where: { id: topupId },
        data: {
          status: 'completed',
          completed_at: new Date(),
          stripe_payment_intent_id: stripePaymentIntentId,
        },
      });

      return {
        debtDeducted: result.debtDeducted.toString(),
        finalAdded: result.finalAdded.toString(),
      };
    } catch (error) {
      await this.prisma.walletTopup.updateMany({
        where: {
          id: topupId,
          status: 'processing',
        },
        data: {
          status: 'pending',
        },
      });
      throw error;
    }
  }

  /**
   * Get user wallet balance by userId
   */
  async getUserWalletBalance(userId: number, userType: string) {
    const wallet = await this.walletService.ensureWallet(userId, userType);
    const balance = await this.walletService.getBalance(wallet.id);

    return {
      walletId: wallet.id,
      balance: balance.balance.toString(),
      reserved: balance.reserved.toString(),
      locked: balance.locked.toString(),
      available: balance.available.toString(),
    };
  }

  /**
   * Get user transaction history
   */
  async getUserTransactionHistory(userId: number, userType: string, limit: number, offset: number) {
    const wallet = await this.walletService.ensureWallet(userId, userType);
    const transactions = await this.walletService.getTransactionHistory(wallet.id, limit, offset);

    return {
      walletId: wallet.id,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount.toString(),
        description: tx.description,
        metadata: tx.metadata,
        createdAt: tx.created_at,
      })),
      total: transactions.length,
    };
  }

  /**
   * Get all payment statistics (admin)
   */
  async getPaymentStatistics() {
    const [walletAggregate, allDebts, topups, adminWallets] = await Promise.all([
      this.prisma.wallet.aggregate({
        _sum: {
          balance: true,
          reserved: true,
          locked: true,
        },
      }),
      this.prisma.commissionDebt.findMany({
        select: {
          amount: true,
          status: true,
          paid_at: true,
        },
      }),
      this.prisma.walletTopup.findMany({
        select: {
          amount: true,
          status: true,
          completed_at: true,
        },
      }),
      this.prisma.wallet.findMany({
        where: {
          user: {
            role: 'admin',
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    const pendingDebts = allDebts.filter((d) => d.status === 'pending');
    const paidDebts = allDebts.filter((d) => d.status === 'paid');
    const topupPending = topups.filter((t) => t.status === 'pending').length;
    const topupCompleted = topups.filter((t) => t.status === 'completed').length;

    const totalBalance = BigInt(walletAggregate._sum.balance?.toString() || '0');
    const totalReserved = BigInt(walletAggregate._sum.reserved?.toString() || '0');
    const totalLocked = BigInt(walletAggregate._sum.locked?.toString() || '0');

    let totalPendingDebt = 0n;
    let totalPaidDebt = 0n;
    let topupCompletedAmount = 0n;

    for (const debt of pendingDebts) {
      totalPendingDebt += BigInt(debt.amount.toString());
    }

    for (const debt of paidDebts) {
      totalPaidDebt += BigInt(debt.amount.toString());
    }

    for (const topup of topups) {
      if (topup.status === 'completed') {
        topupCompletedAmount += BigInt(topup.amount.toString());
      }
    }

    const adminWalletIds = adminWallets.map((wallet) => wallet.id);
    const adminTransactions = adminWalletIds.length
      ? await this.prisma.walletTransaction.findMany({
          where: {
            wallet_id: {
              in: adminWalletIds,
            },
          },
          select: {
            type: true,
            amount: true,
            created_at: true,
          },
        })
      : [];

    let platformCommissionCollected = 0n;
    let taxReserveCollected = 0n;

    const trendMap = new Map<
      string,
      { day: string; amount: bigint; commission: bigint; tax: bigint; debtRecovered: bigint }
    >();

    const ensureTrendBucket = (day: string) => {
      if (!trendMap.has(day)) {
        trendMap.set(day, {
          day,
          amount: 0n,
          commission: 0n,
          tax: 0n,
          debtRecovered: 0n,
        });
      }
      return trendMap.get(day)!;
    };

    for (const tx of adminTransactions) {
      const amount = BigInt(tx.amount.toString());
      if (amount <= 0n) {
        continue;
      }

      const day = tx.created_at.toISOString().slice(0, 10);
      const bucket = ensureTrendBucket(day);

      if (tx.type === TransactionType.COMMISSION) {
        platformCommissionCollected += amount;
        bucket.commission += amount;
        bucket.amount += amount;
      }

      if (tx.type === TransactionType.TAX_RESERVE) {
        taxReserveCollected += amount;
        bucket.tax += amount;
        bucket.amount += amount;
      }
    }

    let debtRecoveredTotal = 0n;
    for (const debt of paidDebts) {
      if (!debt.paid_at) {
        continue;
      }
      const amount = BigInt(debt.amount.toString());
      debtRecoveredTotal += amount;
      const day = debt.paid_at.toISOString().slice(0, 10);
      const bucket = ensureTrendBucket(day);
      bucket.debtRecovered += amount;
      bucket.amount += amount;
    }

    // Cash/debt recovery is a 15% pool. Split it into platform/tax shares.
    // Platform (6.5% of 15%): 65/150
    // Tax (8.5% of 15%): 85/150
    const debtRecoveredPlatformShare = (debtRecoveredTotal * 65n) / 150n;
    const debtRecoveredTaxShare = debtRecoveredTotal - debtRecoveredPlatformShare;

    const effectivePlatformCommission =
      platformCommissionCollected + debtRecoveredPlatformShare;
    const effectiveTaxReserve = taxReserveCollected + debtRecoveredTaxShare;
    const commissionWalletTotal = effectivePlatformCommission + effectiveTaxReserve;

    const revenueTrend = Array.from(trendMap.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-10)
      .map((entry) => ({
        day: entry.day,
        amount: entry.amount.toString(),
        commission: entry.commission.toString(),
        tax: entry.tax.toString(),
        debtRecovered: entry.debtRecovered.toString(),
      }));

    const transactionTypeBreakdown = [
      { type: 'commission', amount: effectivePlatformCommission.toString() },
      { type: 'tax_reserve', amount: effectiveTaxReserve.toString() },
      { type: 'debt_repayment', amount: debtRecoveredTotal.toString() },
      { type: 'topup_completed', amount: topupCompletedAmount.toString() },
    ];

    return {
      walletStats: {
        totalBalance: totalBalance.toString(),
        totalReserved: totalReserved.toString(),
        totalLocked: totalLocked.toString(),
        totalAvailable: (totalBalance - totalReserved - totalLocked).toString(),
      },
      debtStats: {
        pendingCount: pendingDebts.length,
        paidCount: paidDebts.length,
        totalPending: totalPendingDebt.toString(),
        totalPaid: totalPaidDebt.toString(),
      },
      topupStats: {
        pendingCount: topupPending,
        completedCount: topupCompleted,
        completedAmount: topupCompletedAmount.toString(),
      },
      commissionBreakdown: this.commissionService.getCommissionBreakdown(),
      financialTotals: {
        commissionWalletTotal: commissionWalletTotal.toString(),
        platformCommissionCollected: effectivePlatformCommission.toString(),
        taxReserveCollected: effectiveTaxReserve.toString(),
        debtRecovered: debtRecoveredTotal.toString(),
        topupProcessed: topupCompletedAmount.toString(),
        outstandingDebt: totalPendingDebt.toString(),
      },
      revenueTrend,
      transactionTypeBreakdown,
    };
  }

  /**
   * Get all debts (admin)
   */
  async getAllDebts(status: 'pending' | 'paid' | 'all', limit: number, offset: number) {
    const where: any = {};
    if (status !== 'all') {
      where.status = status;
    }

    const debts = await this.prisma.commissionDebt.findMany({
      where,
      include: {
        driver: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
      orderBy: { due_date: 'asc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.commissionDebt.count({ where });

    return {
      debts: debts.map((d) => ({
        id: d.id,
        driverId: d.driver_id,
        driverName: d.driver.full_name,
        driverEmail: d.driver.email,
        bookingId: d.booking_id,
        amount: d.amount.toString(),
        status: d.status,
        dueDate: d.due_date,
        paidAt: d.paid_at,
        createdAt: d.created_at,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get driver earnings summary
   */
  async getRoleEarningsSummary(userId: number, userType: string) {
    const wallet = await this.walletService.ensureWallet(userId, userType);

    // Get balance info
    const balance = await this.walletService.getBalance(wallet.id);

    // Get pending debts
    const pendingDebts =
      userType === 'driver'
        ? await this.prisma.commissionDebt.findMany({
            where: { driver_id: userId, status: 'pending' },
          })
        : [];

    let totalPendingDebt = 0n;
    for (const debt of pendingDebts) {
      totalPendingDebt += BigInt(debt.amount.toString());
    }

    // Split earnings from self-funded topups for accurate reporting.
    const transactions = await this.walletService.getTransactionHistory(wallet.id, 1000, 0);
    let totalEarnedFromTrips = 0n;
    let totalTopups = 0n;

    for (const tx of transactions) {
      if (tx.type === TransactionType.COMMISSION && tx.amount > 0n) {
        totalEarnedFromTrips += tx.amount;
      }
      if (tx.type === TransactionType.TOPUP && tx.amount > 0n) {
        totalTopups += tx.amount;
      }
    }

    return {
      walletId: wallet.id,
      balance: {
        current: balance.balance.toString(),
        available: balance.available.toString(),
      },
      debts: {
        pending: totalPendingDebt.toString(),
        count: pendingDebts.length,
      },
      earnings: {
        total: totalEarnedFromTrips.toString(),
        fromTrips: totalEarnedFromTrips.toString(),
        topups: totalTopups.toString(),
        currentBalance: balance.balance.toString(),
      },
    };
  }

  async getDriverEarningsSummary(userId: number, userType: string = 'driver') {
    return this.getRoleEarningsSummary(userId, userType);
  }

  async getHotelManagerEarningsSummary(userId: number) {
    return this.getRoleEarningsSummary(userId, 'hotel_manager');
  }

  /**
   * Get audit trail (admin)
   */
  async getAuditTrail(walletId?: string, type?: string, limit: number = 100, offset: number = 0) {
    const where: any = {};
    if (walletId) {
      where.wallet_id = walletId;
    }
    if (type) {
      where.type = type;
    }

    const transactions = await this.prisma.walletTransaction.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
      include: {
        wallet: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                full_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const total = await this.prisma.walletTransaction.count({ where });

    return {
      transactions: transactions.map((tx) => ({
        id: tx.id,
        walletId: tx.wallet_id,
        userId: tx.wallet.user?.id,
        userName: tx.wallet.user?.full_name,
        userEmail: tx.wallet.user?.email,
        type: tx.type,
        amount: tx.amount.toString(),
        description: tx.description,
        metadata: tx.metadata,
        createdAt: tx.created_at,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Approve booking payment transfer to driver after trip completion.
   */
  async approveBookingPayment(
    bookingId: number,
    customerId: number,
    userType: string,
    approvalNotes?: string,
  ) {
    if (userType !== 'client') {
      throw new BadRequestException('Only customers can approve booking payments');
    }

    const booking = await this.prisma.carBooking.findUnique({
      where: { id: bookingId },
      include: {
        car: {
          include: {
            driver: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.user_id !== customerId) {
      throw new BadRequestException('You do not have permission to approve this booking payment');
    }

    if (booking.payment_method !== 'wallet') {
      throw new BadRequestException('This booking is not a wallet payment booking');
    }

    if (booking.status !== 'COMPLETED') {
      throw new BadRequestException('Booking must be completed before approving payment');
    }

    const paymentTx = await this.prisma.paymentTransaction.findFirst({
      where: {
        booking_car_id: bookingId,
      payment_method: 'wallet',
      status: 'requires_payment',
      },
      orderBy: { created_at: 'desc' },
    });

    if (!paymentTx) {
      throw new BadRequestException('No held wallet payment found for this booking');
    }

    // Car booking amounts are Decimal(10,2). Convert rupees to paisa bigint for wallet ledger.
    const totalPaisa = BigInt(Math.round(Number(booking.total_amount.toString()) * 100));
    const driverPaisa = BigInt(Math.round(Number(booking.driver_earnings.toString()) * 100));
      // Split commission: 6.5% platform, 8.5% tax from the total commission
      const commissionTotalPaisa = BigInt(Math.round(Number(booking.platform_fee.toString()) * 100));
      // Platform share: 6.5/15 of commission
      // Tax share: 8.5/15 of commission
      const platformPaisa = (commissionTotalPaisa * 65n) / 150n;  // 6.5%
      const taxPaisa = commissionTotalPaisa - platformPaisa;  // 8.5%

    const driverWallet = await this.walletService.ensureWallet(booking.car.driver.user_id, 'driver');
    await this.prisma.wallet.update({
      where: { id: driverWallet.id },
      data: {
        balance: {
          increment: driverPaisa,
        },
      },
    });

    await this.prisma.walletTransaction.create({
      data: {
        wallet_id: driverWallet.id,
        type: TransactionType.COMMISSION,
        amount: driverPaisa,
        booking_id: bookingId,
        description: `Driver payout from booking #${bookingId} approved by customer`,
        metadata: approvalNotes ? { approvalNotes } : undefined,
      },
    });

    const adminWallet = await this.prisma.wallet.findFirst({
      where: { user: { role: 'admin' } },
    });

    if (adminWallet && platformPaisa > 0n) {
      await this.prisma.wallet.update({
        where: { id: adminWallet.id },
        data: {
          balance: {
            increment: platformPaisa,
          },
        },
      });

      await this.prisma.walletTransaction.create({
        data: {
          wallet_id: adminWallet.id,
          type: TransactionType.COMMISSION,
          amount: platformPaisa,
          booking_id: bookingId,
          description: `Platform fee from booking #${bookingId}`,
        },
      });
    }

    if (adminWallet && taxPaisa > 0n) {
      await this.prisma.wallet.update({
        where: { id: adminWallet.id },
        data: {
          balance: {
            increment: taxPaisa,
          },
        },
      });

      await this.prisma.walletTransaction.create({
        data: {
          wallet_id: adminWallet.id,
          type: TransactionType.TAX_RESERVE,
          amount: taxPaisa,
          booking_id: bookingId,
          description: `Tax reserve from booking #${bookingId}`,
        },
      });
    }

    await this.prisma.paymentTransaction.update({
      where: { id: paymentTx.id },
      data: { status: 'completed' },
    });

    return {
      success: true,
      message: `Payment approved. Driver credited PKR ${(Number(driverPaisa) / 100).toFixed(2)}`,
      paymentDetails: {
        bookingId,
        totalAmount: (Number(totalPaisa) / 100).toFixed(2),
        driverAmount: (Number(driverPaisa) / 100).toFixed(2),
        platformFee: (Number(platformPaisa) / 100).toFixed(2),
        taxAmount: (Number(taxPaisa) / 100).toFixed(2),
      },
    };
  }
}




