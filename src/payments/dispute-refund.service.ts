import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DisputeRefund } from '@prisma/client';
import { WalletService, TransactionType } from './wallet.service';

@Injectable()
export class DisputeRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Process dispute refund
   * Handles both online and cash booking refunds differently
   */
  async processRefund(
    disputeId: number,
    refundAmountInPaisa: bigint,
  ): Promise<DisputeRefund> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Determine if online or cash booking
    let refundType = 'cash'; // Default
    let driverId: number | null = null;
    let bookingId: number | null = null;

    if (dispute.booking_car_id) {
      bookingId = dispute.booking_car_id;

      const carBooking = await this.prisma.carBooking.findUnique({
        where: { id: bookingId },
        include: {
          car: {
            include: {
              driver: true,
            },
          },
        },
      });

      driverId = carBooking?.car.driver.user_id ?? null;

      // Check if payment was online
      const carPayment = await this.prisma.paymentTransaction.findFirst({
        where: { booking_car_id: bookingId },
      });

      if (carPayment?.status === 'completed') {
        refundType = 'online';
      }
    }

    if (!driverId && !dispute.booking_hotel_id) {
      throw new BadRequestException('No associated booking found for dispute');
    }

    // Get driver wallet if available
    let wallet = null;
    if (driverId) {
      wallet = await this.prisma.wallet.findFirst({
        where: { user_id: driverId, userType: 'driver' },
      });
    }

    if (!wallet && driverId) {
      throw new NotFoundException('Driver wallet not found');
    }

    // Process refund based on type
    let refundRecord: DisputeRefund;

    if (refundType === 'online' && wallet) {
      // ONLINE: Credit to driver wallet
      refundRecord = await this.creditDisputeRefund(
        disputeId,
        wallet.id,
        refundAmountInPaisa,
        'online',
      );
    } else if (refundType === 'cash') {
      // CASH: Create debt record (driver owes less)
      refundRecord = await this.createCashRefundRecord(
        disputeId,
        driverId || 0,
        refundAmountInPaisa,
      );
    } else {
      throw new BadRequestException('Cannot process refund for this dispute type');
    }

    return refundRecord;
  }

  /**
   * Credit refund to driver wallet (online booking)
   */
  async creditDisputeRefund(
    disputeId: number,
    walletId: string,
    refundAmountInPaisa: bigint,
    refundType: 'online' | 'cash',
  ): Promise<DisputeRefund> {
    // Add balance to wallet
    await this.walletService.addBalance(
      walletId,
      refundAmountInPaisa,
      TransactionType.REFUND,
      { disputeId, refundType },
    );

    // Create refund record
    const refund = await this.prisma.disputeRefund.create({
      data: {
        dispute_id: disputeId,
        wallet_id: walletId,
        amount: refundAmountInPaisa,
        refund_type: refundType,
        status: 'completed',
        processed_at: new Date(),
      },
    });

    return refund;
  }

  /**
   * Create cash refund record (reduces debt for cash booking)
   */
  private async createCashRefundRecord(
    disputeId: number,
    driverId: number,
    refundAmountInPaisa: bigint,
  ): Promise<DisputeRefund> {
    // Get wallet
    const wallet = await this.prisma.wallet.findFirst({
      where: { user_id: driverId, userType: 'driver' },
    });

    if (!wallet) {
      throw new NotFoundException('Driver wallet not found');
    }

    // For cash bookings, we reduce their outstanding debt
    // This is recorded as a negative debt repayment
    await this.walletService.recordTransaction(
      wallet.id,
      TransactionType.REFUND,
      refundAmountInPaisa,
      { disputeId, type: 'cash_refund' },
    );

    // Create refund record
    const refund = await this.prisma.disputeRefund.create({
      data: {
        dispute_id: disputeId,
        wallet_id: wallet.id,
        amount: refundAmountInPaisa,
        refund_type: 'cash',
        status: 'completed',
        processed_at: new Date(),
      },
    });

    return refund;
  }

  /**
   * Get all refunds for a dispute
   */
  async getDisputeRefunds(disputeId: number): Promise<DisputeRefund[]> {
    return this.prisma.disputeRefund.findMany({
      where: { dispute_id: disputeId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get total refunded amount for a dispute
   */
  async getTotalRefunded(disputeId: number): Promise<bigint> {
    const refunds = await this.prisma.disputeRefund.findMany({
      where: { dispute_id: disputeId, status: 'completed' },
    });

    let total = 0n;
    for (const refund of refunds) {
      total = total + BigInt(refund.amount.toString());
    }
    return total;
  }
}
