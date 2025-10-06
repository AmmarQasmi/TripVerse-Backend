import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
	controllers: [PaymentsController, StripeWebhookController],
	providers: [PaymentsService],
})
export class PaymentsModule {}


