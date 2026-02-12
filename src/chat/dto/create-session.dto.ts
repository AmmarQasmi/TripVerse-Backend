import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AiAgentType } from '@prisma/client';

export class CreateSessionDto {
  @IsEnum(AiAgentType)
  agentType!: AiAgentType;

  @IsOptional()
  @IsString()
  title?: string;
}
