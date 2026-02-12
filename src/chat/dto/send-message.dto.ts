import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class SendMessageDto {
  @IsInt()
  @Min(1)
  sessionId!: number;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
