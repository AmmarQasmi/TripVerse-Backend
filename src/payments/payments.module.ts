import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { WalletService } from './wallet.service';
import { CommissionService } from './commission.service';
import { DisputeRefundService } from './dispute-refund.service';
import { DebtEnforcementService } from './debt-enforcement.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule, ConfigModule],
	controllers: [PaymentsController, StripeWebhookController],
	providers: [
		PaymentsService,
		WalletService,
		CommissionService,
		DisputeRefundService,
		DebtEnforcementService,
	],
	exports: [WalletService, CommissionService, DisputeRefundService, DebtEnforcementService],
})
export class PaymentsModule {}


