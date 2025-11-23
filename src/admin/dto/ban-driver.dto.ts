import { IsNotEmpty, IsString } from 'class-validator';

export class BanDriverDto {
	@IsNotEmpty()
	@IsString()
	reason!: string;
}

