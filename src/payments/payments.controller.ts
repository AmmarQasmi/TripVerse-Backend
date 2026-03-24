import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { DisputeRefundService } from './dispute-refund.service';
import { DebtEnforcementService } from './debt-enforcement.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';

@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly disputeRefundService: DisputeRefundService,
    private readonly debtEnforcementService: DebtEnforcementService,
  ) {}

  // ============ PHASE 5: 9 ENDPOINTS ============

  /**
   * Endpoint 1: POST /payments/wallet/topup
   * Initiate wallet topup
   */
  @Post('/wallet/topup')
  @UseGuards(JwtAuthGuard)
  async initiateTopup(
    @Request() req: any,
    @Body() body: { amountInPaisa: string },
  ) {
    const userId = req.user.id;
    const userType = req.user.role;
    const amountInPaisa = BigInt(body.amountInPaisa);

    return this.paymentsService.initiateTopup(userId, userType, amountInPaisa);
  }

  @Post('/wallet/topup/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmTopup(
    @Body() body: { sessionId: string },
  ) {
    return this.paymentsService.confirmTopupCheckoutSession(body.sessionId);
  }

  /**
   * NEW ENDPOINT: POST /payments/booking/payment-approval
   * Customer approves payment transfer to driver after ride completion
   */
  @Post('/booking/:bookingId/payment-approval')
  @UseGuards(JwtAuthGuard)
  async approveBookingPayment(
    @Request() req: any,
    @Param('bookingId') bookingId: string,
    @Body() body?: { approvalNotes?: string },
  ) {
    const userId = req.user.id;
    const userType = req.user.role;
    return this.paymentsService.approveBookingPayment(
      parseInt(bookingId),
      userId,
      userType,
      body?.approvalNotes,
    );
  }

  /**
   * Endpoint 2: GET /payments/wallet/balance
   * Fetch current wallet balance
   */
  @Get('/wallet/balance')
  @UseGuards(JwtAuthGuard)
  async getWalletBalance(@Request() req: any) {
    const userId = req.user.id;
    const userType = req.user.role;
    return this.paymentsService.getUserWalletBalance(userId, userType);
  }

  /**
   * Endpoint 3: GET /payments/wallet/transactions
   * List wallet transactions (paginated)
   */
  @Get('/wallet/transactions')
  @UseGuards(JwtAuthGuard)
  async getWalletTransactions(
    @Request() req: any,
    @Query('limit') limit: string = '50',
    @Query('offset') offset: string = '0',
  ) {
    const userId = req.user.id;
    const userType = req.user.role;
    return this.paymentsService.getUserTransactionHistory(
      userId,
      userType,
      parseInt(limit),
      parseInt(offset),
    );
  }

  /**
   * Endpoint 4: GET /admin/payments/stats
   * Platform commission and payment statistics
   */
  @Get('/admin/payments/stats')
  @UseGuards(JwtAuthGuard)
  async getPaymentStats(@Request() req: any) {
    // Check if admin
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    return this.paymentsService.getPaymentStatistics();
  }

  /**
   * Endpoint 5: GET /admin/payments/debts
   * List all cash booking commission debts
   */
  @Get('/admin/payments/debts')
  @UseGuards(JwtAuthGuard)
  async getAllDebts(
    @Request() req: any,
    @Query('status') status: string = 'pending',
    @Query('limit') limit: string = '50',
    @Query('offset') offset: string = '0',
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    return this.paymentsService.getAllDebts(
      status as any,
      parseInt(limit),
      parseInt(offset),
    );
  }

  /**
   * Endpoint 6: GET /driver/earnings/summary
   * Driver earnings summary
   */
  @Get('/driver/earnings/summary')
  @UseGuards(JwtAuthGuard)
  async getDriverEarnings(@Request() req: any) {
    const userId = req.user.id;
    const userType = req.user.role;
    return this.paymentsService.getDriverEarningsSummary(userId, userType);
  }

  @Get('/hotel-manager/earnings/summary')
  @UseGuards(JwtAuthGuard)
  async getHotelManagerEarnings(@Request() req: any) {
    if (req.user.role !== 'hotel_manager') {
      throw new ForbiddenException('Hotel manager only');
    }
    const userId = req.user.id;
    return this.paymentsService.getHotelManagerEarningsSummary(userId);
  }

  /**
   * Endpoint 7: POST /admin/disputes/{id}/process-refund
   * Process dispute refund
   */
  @Post('/admin/disputes/:disputeId/process-refund')
  @UseGuards(JwtAuthGuard)
  async processDisputeRefund(
    @Request() req: any,
    @Param('disputeId') disputeId: string,
    @Body() body: { refundAmountInPaisa: string },
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    const refundAmount = BigInt(body.refundAmountInPaisa);
    return this.disputeRefundService.processRefund(parseInt(disputeId), refundAmount);
  }

  /**
   * Endpoint 8: GET /admin/wallet/audit-trail
   * Full transaction audit log (filterable)
   */
  @Get('/admin/wallet/audit-trail')
  @UseGuards(JwtAuthGuard)
  async getAuditTrail(
    @Request() req: any,
    @Query('walletId') walletId?: string,
    @Query('type') type?: string,
    @Query('limit') limit: string = '100',
    @Query('offset') offset: string = '0',
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    return this.paymentsService.getAuditTrail(
      walletId,
      type,
      parseInt(limit),
      parseInt(offset),
    );
  }

  /**
   * Endpoint 9: POST /admin/debts/enforce
   * Manual debt enforcement trigger
   */
  @Post('/admin/debts/enforce')
  @UseGuards(JwtAuthGuard)
  async enforceDebt(
    @Request() req: any,
    @Body() body: { debtId: string },
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    return this.debtEnforcementService.triggerManualEnforcement(body.debtId);
  }

  // ============ HEALTH CHECK ============

  @Get('/payments/health')
  health() {
    return { ok: true, service: 'payments' };
  }
}



