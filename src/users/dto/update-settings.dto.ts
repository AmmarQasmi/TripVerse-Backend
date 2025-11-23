import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
	@IsOptional()
	@IsBoolean()
	notifications_enabled?: boolean;

	@IsOptional()
	@IsBoolean()
	email_notifications_enabled?: boolean;
}

