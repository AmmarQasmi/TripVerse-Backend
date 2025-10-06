import { Controller, Get } from '@nestjs/common';

@Controller('webhooks/stripe')
export class StripeWebhookController {
	@Get('health')
	health() {
		return { ok: true, service: 'stripe-webhook' };
	}
}


