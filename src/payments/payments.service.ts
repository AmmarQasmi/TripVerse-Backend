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

    // Cash/debt recovery is platform's 15% pool.
    // Internal split of that pool: 85% net commission, 15% tax reserve.
    const debtRecoveredPlatformShare = (debtRecoveredTotal * 85n) / 100n;
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

  async getDriverDebts(status: 'pending' | 'paid' | 'all', limit: number, offset: number) {
    return this.getAllDebts(status, limit, offset);
  }

  async getHotelDebts(status: 'pending' | 'paid' | 'all', limit: number, offset: number) {
    const txs = await this.prisma.walletTransaction.findMany({
      where: {
        type: TransactionType.HOTEL_DEBT,
        wallet: {
          user: {
            role: 'hotel_manager',
          },
        },
      },
      include: {
        wallet: {
          include: {
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
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });

    const normalized = txs
      .map((tx) => {
        const metadata = (tx.metadata || {}) as Record<string, any>;
        const debtStatus = metadata.status || 'pending';
        const amount = tx.amount < 0n ? -tx.amount : tx.amount;
        return {
          id: tx.id,
          managerId: tx.wallet.user?.id,
          managerName: tx.wallet.user?.full_name,
          managerEmail: tx.wallet.user?.email,
          bookingId: metadata.bookingId,
          amount: amount.toString(),
          status: debtStatus,
          dueDate: metadata.dueAt || null,
          paidAt: metadata.recoveredAt || null,
          createdAt: tx.created_at,
        };
      })
      .filter((row) => (status === 'all' ? true : row.status === status));

    return {
      debts: normalized,
      total: normalized.length,
      limit,
      offset,
    };
  }

  async getDriverDebtDetail(debtId: string) {
    const debt = await this.prisma.commissionDebt.findUnique({
      where: { id: debtId },
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

    if (!debt) {
      throw new NotFoundException('Driver debt not found');
    }

    return {
      id: debt.id,
      type: 'driver',
      actor: {
        id: debt.driver.id,
        name: debt.driver.full_name,
        email: debt.driver.email,
      },
      bookingId: debt.booking_id,
      amount: debt.amount.toString(),
      dueDate: debt.due_date,
      status: debt.status,
      paidAt: debt.paid_at,
      createdAt: debt.created_at,
      updatedAt: debt.updated_at,
    };
  }

  async getHotelDebtDetail(transactionId: string) {
    const tx = await this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: {
        wallet: {
          include: {
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

    if (!tx || tx.type !== TransactionType.HOTEL_DEBT) {
      throw new NotFoundException('Hotel debt not found');
    }

    const metadata = (tx.metadata || {}) as Record<string, any>;
    const amount = tx.amount < 0n ? -tx.amount : tx.amount;

    return {
      id: tx.id,
      type: 'hotel',
      actor: {
        id: tx.wallet.user?.id,
        name: tx.wallet.user?.full_name,
        email: tx.wallet.user?.email,
      },
      bookingId: metadata.bookingId,
      amount: amount.toString(),
      dueDate: metadata.dueAt || null,
      status: metadata.status || 'pending',
      paidAt: metadata.recoveredAt || null,
      createdAt: tx.created_at,
      metadata,
    };
  }

  /**
   * Get driver earnings summary
   */
  async getRoleEarningsSummary(userId: number, userType: string) {
    const wallet = await this.walletService.ensureWallet(userId, userType);

    // Get balance info
    const balance = await this.walletService.getBalance(wallet.id);

    let totalPendingDebt = 0n;
    let pendingDebtCount = 0;
    let pendingHotelDebtRows: Array<{
      id: string;
      bookingId: string | number | null;
      dueDate: string | null;
      amount: string;
      status: string;
      createdAt: string;
    }> = [];

    if (userType === 'driver') {
      const pendingDebts = await this.prisma.commissionDebt.findMany({
        where: { driver_id: userId, status: 'pending' },
        select: { amount: true },
      });
      for (const debt of pendingDebts) {
        totalPendingDebt += BigInt(debt.amount.toString());
      }
      pendingDebtCount = pendingDebts.length;
    } else if (userType === 'hotel_manager') {
      const hotelDebtTxs = await this.prisma.walletTransaction.findMany({
        where: {
          wallet_id: wallet.id,
          type: TransactionType.HOTEL_DEBT,
        },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          amount: true,
          metadata: true,
          created_at: true,
        },
      });

      const pendingRows = hotelDebtTxs
        .map((tx) => {
          const metadata = (tx.metadata || {}) as Record<string, any>;
          const status = String(metadata.status || 'pending').toLowerCase();
          const isPending = status !== 'recovered' && status !== 'cancelled';
          if (!isPending || tx.amount >= 0n) {
            return null;
          }
          const dueAt = typeof metadata.dueAt === 'string' ? metadata.dueAt : null;
          const bookingId =
            typeof metadata.bookingId === 'number' || typeof metadata.bookingId === 'string'
              ? metadata.bookingId
              : null;
          // Ignore legacy/orphan hotel debt rows missing required linkage fields.
          if (!bookingId || !dueAt) {
            return null;
          }
          const amount = -tx.amount;
          return {
            id: tx.id,
            bookingId,
            dueDate: dueAt,
            amount: amount.toString(),
            status: status || 'pending',
            createdAt: tx.created_at.toISOString(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      for (const row of pendingRows) {
        totalPendingDebt += BigInt(row.amount);
      }
      pendingDebtCount = pendingRows.length;
      pendingHotelDebtRows = pendingRows;
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
        count: pendingDebtCount,
        items: userType === 'hotel_manager' ? pendingHotelDebtRows : undefined,
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

  /**
   * Check withdrawal eligibility for a user
   * Available = Balance - Pending Debt - Reserved - Locked
   */
  async getWithdrawalEligibility(userId: number, userType: string) {
    const wallet = await this.walletService.ensureWallet(userId, userType);
    const balance = await this.walletService.getBalance(wallet.id);

    // Get pending debts (driver commission debts)
    let pendingDebtAmount = 0n;
    if (userType === 'driver') {
      const debts = await this.prisma.commissionDebt.findMany({
        where: { driver_id: userId, status: 'pending' },
      });
      for (const debt of debts) {
        pendingDebtAmount += BigInt(debt.amount.toString());
      }
    }

    // Get pending hotel debts (for hotel managers)
    let pendingHotelDebt = 0n;
    if (userType === 'hotel_manager') {
      const hotelDebts = await this.prisma.walletTransaction.findMany({
        where: {
          wallet_id: wallet.id,
          type: 'hotel_debt',
        },
      });
      for (const debt of hotelDebts) {
        const metadata = (debt.metadata || {}) as Record<string, any>;
        const status = String(metadata.status || 'pending').toLowerCase();
        const isPending = status !== 'recovered' && status !== 'cancelled';
        // Keep withdrawal eligibility aligned with earnings debt logic:
        // ignore legacy/orphan hotel debt rows missing booking linkage/due date.
        const hasBookingId = typeof metadata.bookingId === 'number' || typeof metadata.bookingId === 'string';
        const hasDueAt = typeof metadata.dueAt === 'string';
        if (isPending && debt.amount < 0n) {
          if (!hasBookingId || !hasDueAt) {
            continue;
          }
          // Convert negative bigint to positive for calculation
          pendingHotelDebt += (0n - debt.amount);
        }
      }
    }

    const totalPendingDebt = userType === 'admin' ? 0n : pendingDebtAmount + pendingHotelDebt;
    const eligibleAmount = balance.available - totalPendingDebt;

    return {
      walletId: wallet.id,
      totalBalance: balance.balance.toString(),
      reserved: balance.reserved.toString(),
      locked: balance.locked.toString(),
      available: balance.available.toString(),
      pendingDebts: totalPendingDebt.toString(),
      eligibleForWithdrawal: (eligibleAmount > 0n ? eligibleAmount : 0n).toString(),
      canWithdraw: eligibleAmount > 0n,
      minimumWithdrawalAmount: '50000', // PKR 500 minimum in paisa
    };
  }

  /**
   * Initiate bank transfer withdrawal for driver/hotel_manager
   * Supports Stripe payout + manual transfer fallback
   */
  async initiateWithdrawal(
    userId: number,
    userType: string,
    amountInPaisa: bigint,
    bankDetails?: {
      bankAccountNumber?: string;
      bankRoutingNumber?: string;
      bankHolderName?: string;
      paymentMethod?: 'stripe_payout' | 'manual_transfer';
    },
  ) {
    if (userType !== 'driver' && userType !== 'hotel_manager' && userType !== 'admin') {
      throw new BadRequestException('Only driver, hotel_manager, and admin can withdraw funds');
    }

    // Check eligibility
    const eligibility = await this.getWithdrawalEligibility(userId, userType);
    const eligibleAmount = BigInt(eligibility.eligibleForWithdrawal);
    
    if (amountInPaisa <= 0n) {
      throw new BadRequestException('Withdrawal amount must be greater than 0');
    }

    if (amountInPaisa < BigInt(eligibility.minimumWithdrawalAmount)) {
      throw new BadRequestException(
        `Minimum withdrawal amount is PKR 500 (${eligibility.minimumWithdrawalAmount} paisa)`,
      );
    }

    if (amountInPaisa > eligibleAmount) {
      throw new BadRequestException(
        `Insufficient eligible balance. Available: ${eligibleAmount.toString()}, Requested: ${amountInPaisa.toString()}`,
      );
    }

    const wallet = await this.walletService.ensureWallet(userId, userType);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Determine which payment method to use
    const paymentMethod = bankDetails?.paymentMethod || 'stripe_payout';
    let stripePayoutId: string | null = null;

    try {
      if (paymentMethod === 'stripe_payout' && user.role === 'driver') {
        // Try Stripe payout first for drivers
        const driver = await this.prisma.driver.findUnique({
          where: { user_id: userId },
        });

        if (driver?.stripe_account_id) {
          const stripe = this.getStripeClient();
          try {
            const payout = await stripe.payouts.create(
              {
                amount: Number(amountInPaisa),
                currency: 'pkr',
                description: `TripVerse withdrawal for ${user.full_name}`,
              },
              {
                stripeAccount: driver.stripe_account_id,
              },
            );
            stripePayoutId = payout.id;
          } catch (stripeError) {
            // Fall back to manual transfer
            console.warn('Stripe payout failed, falling back to manual transfer:', stripeError);
          }
        }
      }

      // Create wallet transaction record
      const transaction = await this.prisma.walletTransaction.create({
        data: {
          wallet_id: wallet.id,
          type: TransactionType.BANK_TRANSFER,
          amount: -amountInPaisa, // Negative because it's going out
          description: `Bank transfer withdrawal - ${paymentMethod}`,
          metadata: {
            withdrawalType: 'bank_transfer',
            paymentMethod,
            stripePayoutId,
            bankDetails: {
              ...bankDetails,
              bankAccountNumber: bankDetails?.bankAccountNumber ? `****${bankDetails.bankAccountNumber.slice(-4)}` : undefined,
            },
            status: stripePayoutId ? 'stripe_processing' : 'pending_manual',
            initiatedAt: new Date(),
            userId,
            userType,
          },
        },
      });

      // Deduct from wallet
      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            decrement: amountInPaisa,
          },
        },
      });

      return {
        success: true,
        transactionId: transaction.id,
        amount: (Number(amountInPaisa) / 100).toFixed(2),
        currency: 'pkr',
        status: stripePayoutId ? 'processing' : 'pending_manual_approval',
        message: stripePayoutId 
          ? 'Withdrawal initiated via Stripe payout and will be processed within 2-3 business days'
          : 'Withdrawal submitted for manual processing. Admin will complete within 24 hours',
        stripePayoutId,
        details: {
          walletId: wallet.id,
          remainingBalance: (Number((eligibleAmount - amountInPaisa)) / 100).toFixed(2),
          fee: '0', // No platform fee on withdrawals
        },
      };
    } catch (error) {
      throw new BadRequestException(
        `Withdrawal initiation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Admin endpoint to approve/complete manual withdrawal
   */
  async approveManualWithdrawal(
    transactionId: string,
    approverNotes?: string,
  ) {
    const transaction = await this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: { wallet: { include: { user: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const metadata = (transaction.metadata as Record<string, any>) || {};
    
    if (metadata.status !== 'pending_manual') {
      throw new BadRequestException('This transaction is not pending manual approval');
    }

    // Update transaction to completed
    const updatedTx = await this.prisma.walletTransaction.update({
      where: { id: transactionId },
      data: {
        metadata: {
          ...metadata,
          status: 'completed',
          completedAt: new Date(),
          approverNotes,
        },
      },
    });

    return {
      success: true,
      transactionId: updatedTx.id,
      message: 'Manual withdrawal approved and processed',
      amount: (Number(updatedTx.amount) / 100).toFixed(2),
      currency: 'pkr',
      status: 'completed',
      completedAt: (updatedTx.metadata as any)?.completedAt,
      notes: approverNotes,
    };
  }

  /**
   * Check withdrawal status for tracking
   */
  async getWithdrawalStatus(transactionId: string) {
    const transaction = await this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: {
        wallet: {
          include: {
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

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const metadata = (transaction.metadata as Record<string, any>) || {};

    return {
      transactionId: transaction.id,
      userId: transaction.wallet.user.id,
      userName: transaction.wallet.user.full_name,
      amount: (Number(transaction.amount) / 100).toFixed(2),
      currency: 'pkr',
      status: metadata.status || 'unknown',
      paymentMethod: metadata.paymentMethod,
      stripePayoutId: metadata.stripePayoutId,
      initiatedAt: transaction.created_at,
      completedAt: metadata.completedAt,
      approverNotes: metadata.approverNotes,
      bankDetails: metadata.bankDetails,
    };
  }
}






