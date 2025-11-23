import { IsNotEmpty, IsString } from 'class-validator';

export class SuspendDriverDto {
	@IsNotEmpty()
	@IsString()
	reason!: string;
}

