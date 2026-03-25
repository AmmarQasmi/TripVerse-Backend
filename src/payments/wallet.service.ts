import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Wallet, WalletTransaction } from '@prisma/client';

export enum TransactionType {
  COMMISSION = 'commission',
  TOPUP = 'topup',
  DEDUCTION = 'deduction',
  REFUND = 'refund',
  TAX_RESERVE = 'tax_reserve',
  DEBT_REPAYMENT = 'debt_repayment',
  RENEWAL_FEE = 'renewal_fee',
  HOTEL_DEBT = 'hotel_debt',
  BANK_TRANSFER = 'bank_transfer',
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure wallet exists for user, create if not
   */
  async ensureWallet(userId: number, userType: string): Promise<Wallet> {
    return this.prisma.wallet.upsert({
      where: {
        user_id_userType: {
          user_id: userId,
          userType,
        },
      },
      update: {},
      create: {
        user_id: userId,
        userType,
        balance: 0n,
        reserved: 0n,
        locked: 0n,
      },
    });
  }

  /**
   * Record transaction atomically to wallet ledger
   * Uses BigInt for PKR amounts (stored in paisa, e.g., 5000 = 50 PKR)
   */
  async recordTransaction(
    walletId: string,
    type: TransactionType,
    amountInPaisa: bigint,
    metadata?: Record<string, any>,
  ): Promise<WalletTransaction> {
    return this.prisma.walletTransaction.create({
      data: {
        wallet_id: walletId,
        type,
        amount: amountInPaisa,
        metadata,
        created_at: new Date(),
      },
    });
  }

  /**
   * Get current wallet balance
   */
  async getBalance(walletId: string): Promise<{
    balance: bigint;
    reserved: bigint;
    locked: bigint;
    available: bigint;
  }> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      balance: wallet.balance,
      reserved: wallet.reserved,
      locked: wallet.locked,
      available: wallet.balance - wallet.reserved - wallet.locked,
    };
  }

  /**
   * Add amount to wallet (e.g., topup)
   */
  async addBalance(
    walletId: string,
    amountInPaisa: bigint,
    type: TransactionType,
    metadata?: Record<string, any>,
  ): Promise<Wallet> {
    // Record transaction
    await this.recordTransaction(walletId, type, amountInPaisa, metadata);

    // Update balance
    return this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: {
          increment: amountInPaisa,
        },
      },
    });
  }

  /**
   * Deduct amount from wallet (e.g., commission, fees)
   * Checks if available balance is sufficient
   */
  async deductBalance(
    walletId: string,
    amountInPaisa: bigint,
    type: TransactionType,
    metadata?: Record<string, any>,
  ): Promise<Wallet> {
    // Fetch current balance
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const available = wallet.balance - wallet.reserved - wallet.locked;

    if (available < amountInPaisa) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${available} paisa`,
      );
    }

    // Record transaction (negative for deduction)
    await this.recordTransaction(walletId, type, -amountInPaisa, metadata);

    // Update balance
    return this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: {
          decrement: amountInPaisa,
        },
      },
    });
  }

  /**
   * Reserve amount for pending operations
   */
  async reserveBalance(walletId: string, amountInPaisa: bigint): Promise<Wallet> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const available = wallet.balance - wallet.reserved - wallet.locked;

    if (available < amountInPaisa) {
      throw new BadRequestException(
        `Cannot reserve. Available: ${available} paisa`,
      );
    }

    return this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        reserved: {
          increment: amountInPaisa,
        },
      },
    });
  }

  /**
   * Release reserved balance
   */
  async releaseReserve(walletId: string, amountInPaisa: bigint): Promise<Wallet> {
    return this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        reserved: {
          decrement: amountInPaisa,
        },
      },
    });
  }

  /**
   * Auto-deduct pending debts from topup amount
   * Returns { topupAmount, debtDeducted, finalAvailable }
   */
  async autoDeductPendingDebts(
    walletId: string,
    topupAmountInPaisa: bigint,
  ): Promise<{ debtDeducted: bigint; finalAdded: bigint }> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Get pending debts for this user
    const debts = await this.prisma.commissionDebt.findMany({
      where: {
        driver_id: wallet.user_id,
        status: 'pending',
      },
      orderBy: { due_date: 'asc' },
    });

    let remaining = topupAmountInPaisa;
    let deductedDebt = 0n;

    for (const debt of debts) {
      const debtAmount = BigInt(debt.amount.toString());
      if (remaining < debtAmount) {
        break;
      }

      await this.prisma.commissionDebt.update({
        where: { id: debt.id },
        data: {
          status: 'paid',
          paid_at: new Date(),
        },
      });

      await this.recordTransaction(
        walletId,
        TransactionType.DEBT_REPAYMENT,
        debtAmount,
        { debtId: debt.id },
      );

      remaining -= debtAmount;
      deductedDebt += debtAmount;
    }

    const finalAmount = remaining;

    // Add remaining topup
    if (finalAmount > 0n) {
      await this.addBalance(walletId, finalAmount, TransactionType.TOPUP);
    }

    return {
      debtDeducted: deductedDebt,
      finalAdded: finalAmount,
    };
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    walletId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<WalletTransaction[]> {
    return this.prisma.walletTransaction.findMany({
      where: { wallet_id: walletId },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Force deduct debt even if balance goes negative (hotel debt collection)
   * Called by debt enforcement service
   */
  async forceDeductForDebt(
    walletId: string,
    amountInPaisa: bigint,
    metadata?: Record<string, any>,
  ): Promise<Wallet> {
    // Record transaction (negative for deduction)
    await this.recordTransaction(walletId, TransactionType.HOTEL_DEBT, -amountInPaisa, metadata);

    // Update balance - allow negative
    return this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: {
          decrement: amountInPaisa,
        },
      },
    });
  }

  /**
   * Record bank transfer (to bank, not within wallet)
   */
  async recordBankTransfer(
    walletId: string,
    amountInPaisa: bigint,
    transferMethod: string,
    metadata?: Record<string, any>,
  ): Promise<WalletTransaction> {
    // First deduct from wallet
    await this.deductBalance(walletId, amountInPaisa, TransactionType.BANK_TRANSFER, {
      ...metadata,
      transferMethod,
      transferredAt: new Date(),
    });

    // Record the transaction
    return this.recordTransaction(walletId, TransactionType.BANK_TRANSFER, -amountInPaisa, {
      ...metadata,
      transferMethod,
    });
  }

  /**
   * Get available balance for withdrawal (balance minus pending debt)
   */
  async getWithdrawableBalance(walletId: string, userType: string, userId: number): Promise<{
    total: bigint;
    pendingDebt: bigint;
    withdrawable: bigint;
  }> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Get pending debts
    let pendingDebt = 0n;

    if (userType === 'driver') {
      const debts = await this.prisma.commissionDebt.findMany({
        where: {
          driver_id: userId,
          status: 'pending',
        },
      });
      for (const debt of debts) {
        pendingDebt += BigInt(debt.amount.toString());
      }
    } else if (userType === 'hotel_manager') {
      // Hotel manager debts tracked via wallet transactions with metadata
      const hotelDebts = await this.prisma.walletTransaction.findMany({
        where: {
          wallet_id: walletId,
          type: TransactionType.HOTEL_DEBT,
        },
      });
      // Sum all negative hotel debt transactions (not yet recovered)
      for (const debt of hotelDebts) {
        const metadata = (debt.metadata || {}) as Record<string, any>;
        const status = String(metadata.status || 'pending').toLowerCase();
        const isPending = status !== 'recovered' && status !== 'cancelled';
        if (isPending && debt.amount < 0n) {
          const hasBookingId = typeof metadata.bookingId === 'number' || typeof metadata.bookingId === 'string';
          const hasDueAt = typeof metadata.dueAt === 'string';
          if (!hasBookingId || !hasDueAt) {
            continue;
          }
          pendingDebt += (0n - debt.amount);
        }
      }
    }

    const available = wallet.balance - wallet.reserved - wallet.locked - pendingDebt;

    return {
      total: wallet.balance,
      pendingDebt,
      withdrawable: available > 0n ? available : 0n,
    };
  }

  /**
   * Calculate net commission (12.75% of final amount = 85% of 15%)
   */
  calculatePlatformCommission(finalAmountInPaisa: bigint): bigint {
    return (finalAmountInPaisa * 1275n) / 10000n; // 12.75%
  }

  /**
   * Calculate tax reserve (2.25% of final amount = 15% of 15%)
   */
  calculateTaxReserve(commissionAmountInPaisa: bigint): bigint {
    return (commissionAmountInPaisa * 225n) / 10000n; // 2.25%
  }
  }
