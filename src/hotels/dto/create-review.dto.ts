import { IsInt, IsString, IsOptional, Min, Max, MaxLength } from 'class-validator';

export class CreateReviewDto {
	@IsInt()
	@Min(1)
	@Max(5)
	rating!: number;

	@IsString()
	@IsOptional()
	@MaxLength(1000)
	comment?: string;
}
