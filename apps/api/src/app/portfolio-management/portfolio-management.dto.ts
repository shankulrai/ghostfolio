import { SUPPORTED_BASE_CURRENCIES } from '@ghostfolio/common/config';

import { IsIn, IsString, Length } from 'class-validator';

export class CreatePortfolioDto {
  @IsString()
  @Length(1, 64)
  name: string;

  @IsIn(SUPPORTED_BASE_CURRENCIES)
  baseCurrency: string;
}

export class UpdateBaseCurrencyDto {
  @IsIn(SUPPORTED_BASE_CURRENCIES)
  baseCurrency: string;
}
