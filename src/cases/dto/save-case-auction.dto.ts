import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function toPercent(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return value;
  const normalized = toLatinDigits(value).trim().replace(/,/g, '.').replace(/٬/g, '');
  if (!normalized) return value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

function toAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return value;
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits || digits.length > 15) return value;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

export class AuctionItemDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'نام کالا را وارد کنید' })
  @MinLength(1, { message: 'نام کالا را وارد کنید' })
  @MaxLength(200, { message: 'نام کالا طولانی است' })
  name: string;

  @Transform(({ value }) => toAmount(value))
  @Type(() => Number)
  @IsInt({ message: 'قیمت کالا معتبر نیست' })
  @Min(1, { message: 'قیمت کالا باید بیشتر از صفر باشد' })
  @Max(999_999_999_999_999, { message: 'قیمت کالا بزرگ‌تر از حد مجاز است' })
  price: number;

  @Transform(({ value }) => toPercent(value))
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'درصد تخفیف کالا معتبر نیست' })
  @Min(0, { message: 'درصد تخفیف کالا معتبر نیست' })
  @Max(100, { message: 'درصد تخفیف کالا معتبر نیست' })
  discountPercent: number;
}

export class SaveCaseAuctionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ شروع حراج معتبر نیست' })
  startsAt: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ پایان حراج معتبر نیست' })
  endsAt: string;

  @Transform(({ value }) => toPercent(value))
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'درصد تخفیف از معتبر نیست' })
  @Min(0, { message: 'درصد تخفیف از معتبر نیست' })
  @Max(100, { message: 'درصد تخفیف از معتبر نیست' })
  discountMin: number;

  @Transform(({ value }) => toPercent(value))
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'درصد تخفیف تا معتبر نیست' })
  @Min(0, { message: 'درصد تخفیف تا معتبر نیست' })
  @Max(100, { message: 'درصد تخفیف تا معتبر نیست' })
  discountMax: number;

  @IsArray({ message: 'حداقل یک کالا لازم است' })
  @ArrayMinSize(1, { message: 'حداقل یک کالا لازم است' })
  @ArrayMaxSize(50, { message: 'تعداد کالاها بیش از حد است' })
  @ValidateNested({ each: true })
  @Type(() => AuctionItemDto)
  items: AuctionItemDto[];
}
