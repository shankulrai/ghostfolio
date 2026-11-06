import { LogPerformance } from '@ghostfolio/api/interceptors/performance-logging/performance-logging.interceptor';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { FxRateCacheService } from '@ghostfolio/api/services/fx-rate-cache/fx-rate-cache.service';
import { DataGatheringItem } from '@ghostfolio/api/services/interfaces/interfaces';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  DEFAULT_CURRENCY,
  DERIVED_CURRENCIES,
  PROPERTY_CURRENCIES
} from '@ghostfolio/common/config';
import {
  DATE_FORMAT,
  getAssetProfileIdentifier,
  getStartOfUtcDateOfYesterday
} from '@ghostfolio/common/helper';
import { DataProviderHistoricalResponse } from '@ghostfolio/common/interfaces';

import { utc } from '@date-fns/utc';
import { Injectable, Logger } from '@nestjs/common';
import {
  eachDayOfInterval,
  format,
  isToday,
  isWeekend,
  subDays
} from 'date-fns';
import { isNumber } from 'lodash-es';
import ms from 'ms';

import { ExchangeRatesByCurrency } from './interfaces/exchange-rate-data.interface';

@Injectable()
export class ExchangeRateDataService {
  private readonly logger = new Logger(ExchangeRateDataService.name);

  private currencies: string[] = [];
  private currencyPairs: DataGatheringItem[] = [];
  private derivedCurrencyFactors: { [currencyPair: string]: number } = {};
  private exchangeRates: { [currencyPair: string]: number } = {};

  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly fxRateCacheService: FxRateCacheService,
    private readonly marketDataService: MarketDataService,
    private readonly prismaService: PrismaService,
    private readonly propertyService: PropertyService
  ) {}

  public getCurrencies() {
    return this.currencies?.length > 0 ? this.currencies : [DEFAULT_CURRENCY];
  }

  public getCurrencyPairs() {
    return this.currencyPairs;
  }

  @LogPerformance
  public async getExchangeRatesByCurrency({
    currencies,
    endDate = new Date(),
    startDate,
    targetCurrency
  }: {
    currencies: string[];
    endDate?: Date;
    startDate: Date;
    targetCurrency: string;
  }): Promise<ExchangeRatesByCurrency> {
    if (!startDate) {
      return {};
    }

    // REQ-016: Use batchConvert to enable cache, forward-fill, and provider status checking
    const dates = eachDayOfInterval({ end: endDate, start: startDate });
    const conversions: {
      value: number;
      fromCurrency: string;
      toCurrency: string;
      date: Date;
    }[] = [];

    // Build batch conversion requests for all currency/date combinations
    for (const currency of currencies) {
      if (currency === targetCurrency) {
        continue; // Skip same-currency conversions
      }
      for (const date of dates) {
        conversions.push({
          value: 1,
          fromCurrency: currency,
          toCurrency: targetCurrency,
          date
        });
      }
    }

    const results = await this.batchConvert(conversions);

    const exchangeRatesByCurrency: {
      [currency: string]: { [dateString: string]: number };
    } = {};

    // Initialize maps for each currency
    for (const currency of currencies) {
      exchangeRatesByCurrency[`${currency}${targetCurrency}`] = {};
    }

    // Populate exchange rates from batch results
    let resultIndex = 0;
    for (const currency of currencies) {
      if (currency === targetCurrency) {
        // Same currency always has rate of 1
        for (const date of dates) {
          exchangeRatesByCurrency[`${currency}${targetCurrency}`][
            format(date, DATE_FORMAT)
          ] = 1;
        }
        continue;
      }

      for (const date of dates) {
        const result = results[resultIndex++];
        const rate = result.rate ?? 1;
        exchangeRatesByCurrency[`${currency}${targetCurrency}`][
          format(date, DATE_FORMAT)
        ] = rate;

        if (result.rateUnavailable && currency === DEFAULT_CURRENCY) {
          this.logger.error(
            `No exchange rate has been found for ${currency}${targetCurrency} at ${format(
              date,
              DATE_FORMAT
            )}`
          );
        }
      }
    }

    return exchangeRatesByCurrency;
  }

  public hasCurrencyPair(currency1: string, currency2: string) {
    return this.currencyPairs.some(({ symbol }) => {
      return (
        symbol === `${currency1}${currency2}` ||
        symbol === `${currency2}${currency1}`
      );
    });
  }

  public async initialize() {
    this.currencies = await this.prepareCurrencies();
    this.currencyPairs = [];
    this.derivedCurrencyFactors = {};
    this.exchangeRates = {};

    for (const { currency, factor, rootCurrency } of DERIVED_CURRENCIES) {
      this.derivedCurrencyFactors[`${currency}${rootCurrency}`] = 1 / factor;
      this.derivedCurrencyFactors[`${rootCurrency}${currency}`] = factor;
    }

    for (const {
      currency1,
      currency2,
      dataSource
    } of this.prepareCurrencyPairs(this.currencies)) {
      this.currencyPairs.push({
        dataSource,
        symbol: `${currency1}${currency2}`
      });
    }

    await this.loadCurrencies();
  }

  public async loadCurrencies() {
    const startOfUtcDateOfYesterday = getStartOfUtcDateOfYesterday();

    const dateStringOfYesterday = format(
      startOfUtcDateOfYesterday,
      DATE_FORMAT,
      { in: utc }
    );

    const historicalData = await this.dataProviderService.getHistorical({
      assetProfileIdentifiers: this.currencyPairs,
      from: startOfUtcDateOfYesterday,
      to: startOfUtcDateOfYesterday
    });

    const quotes = await this.dataProviderService.getQuotes({
      items: this.currencyPairs.map(({ dataSource, symbol }) => {
        return { dataSource, symbol };
      }),
      requestTimeout: ms('30 seconds')
    });

    const result: {
      [symbol: string]: { [date: string]: DataProviderHistoricalResponse };
    } = {};

    for (const { dataSource, symbol } of this.currencyPairs) {
      const assetProfileIdentifier = getAssetProfileIdentifier({
        dataSource,
        symbol
      });

      if (historicalData[assetProfileIdentifier]) {
        result[symbol] = historicalData[assetProfileIdentifier];
      }

      const quote = quotes[assetProfileIdentifier];

      if (isNumber(quote?.marketPrice)) {
        result[symbol] = {
          [dateStringOfYesterday]: {
            marketPrice: quote.marketPrice
          }
        };
      }
    }

    const resultExtended = result;

    for (const symbol of Object.keys(result)) {
      const [currency1, currency2] = symbol.match(/.{1,3}/g) ?? [];
      const [date] = Object.keys(result[symbol]);

      // Calculate the opposite direction
      resultExtended[`${currency2}${currency1}`] = {
        [date]: {
          marketPrice: 1 / result[symbol][date].marketPrice
        }
      };
    }

    for (const symbol of Object.keys(resultExtended)) {
      const [currency1, currency2] = symbol.match(/.{1,3}/g) ?? [];

      this.exchangeRates[symbol] =
        resultExtended[symbol]?.[dateStringOfYesterday]?.marketPrice;

      if (!this.exchangeRates[symbol]) {
        // Not found, calculate indirectly via base currency
        this.exchangeRates[symbol] =
          resultExtended[`${currency1}${DEFAULT_CURRENCY}`]?.[
            dateStringOfYesterday
          ]?.marketPrice *
          resultExtended[`${DEFAULT_CURRENCY}${currency2}`]?.[
            dateStringOfYesterday
          ]?.marketPrice;

        // Calculate the opposite direction
        this.exchangeRates[`${currency2}${currency1}`] =
          1 / this.exchangeRates[symbol];
      }
    }
  }

  public toCurrency(
    aValue: number,
    aFromCurrency: string,
    aToCurrency: string
  ) {
    if (aValue === 0) {
      return 0;
    }

    let factor: number;

    if (aFromCurrency === aToCurrency) {
      factor = 1;
    } else {
      if (this.exchangeRates[`${aFromCurrency}${aToCurrency}`]) {
        factor = this.exchangeRates[`${aFromCurrency}${aToCurrency}`];
      } else {
        // Calculate indirectly via base currency
        const factor1 =
          this.exchangeRates[`${aFromCurrency}${DEFAULT_CURRENCY}`];
        const factor2 = this.exchangeRates[`${DEFAULT_CURRENCY}${aToCurrency}`];

        factor = factor1 * factor2;
      }
    }

    if (isNumber(factor) && !isNaN(factor)) {
      return factor * aValue;
    }

    // Fallback with error, if currencies are not available
    this.logger.error(
      `No exchange rate has been found for ${aFromCurrency}${aToCurrency}`
    );

    return aValue;
  }

  public async toCurrencyAtDate(
    aValue: number,
    aFromCurrency: string,
    aToCurrency: string,
    aDate: Date
  ) {
    if (aValue === 0) {
      return 0;
    }

    if (isToday(aDate)) {
      return this.toCurrency(aValue, aFromCurrency, aToCurrency);
    }

    const derivedCurrencyFactor =
      this.derivedCurrencyFactors[`${aFromCurrency}${aToCurrency}`];
    let factor: number | undefined;

    if (aFromCurrency === aToCurrency) {
      factor = 1;
    } else if (derivedCurrencyFactor) {
      factor = derivedCurrencyFactor;
    } else {
      const dataSource =
        this.dataProviderService.getDataSourceForExchangeRates();
      const symbol = `${aFromCurrency}${aToCurrency}`;

      const marketData = await this.marketDataService.get({
        dataSource,
        symbol,
        date: aDate
      });

      if (marketData?.marketPrice) {
        factor = marketData?.marketPrice;
      } else {
        // Calculate indirectly via base currency

        let marketPriceBaseCurrencyFromCurrency: number | undefined;
        let marketPriceBaseCurrencyToCurrency: number | undefined;

        try {
          if (aFromCurrency === DEFAULT_CURRENCY) {
            marketPriceBaseCurrencyFromCurrency = 1;
          } else {
            marketPriceBaseCurrencyFromCurrency = (
              await this.marketDataService.get({
                dataSource,
                date: aDate,
                symbol: `${DEFAULT_CURRENCY}${aFromCurrency}`
              })
            )?.marketPrice;
          }
        } catch {}

        try {
          if (aToCurrency === DEFAULT_CURRENCY) {
            marketPriceBaseCurrencyToCurrency = 1;
          } else {
            marketPriceBaseCurrencyToCurrency = (
              await this.marketDataService.get({
                dataSource,
                date: aDate,
                symbol: `${DEFAULT_CURRENCY}${aToCurrency}`
              })
            )?.marketPrice;
          }
        } catch {}

        if (
          isNumber(marketPriceBaseCurrencyFromCurrency) &&
          isNumber(marketPriceBaseCurrencyToCurrency)
        ) {
          // Calculate the opposite direction
          factor =
            (1 / marketPriceBaseCurrencyFromCurrency) *
            marketPriceBaseCurrencyToCurrency;
        }
      }
    }

    if (isNumber(factor) && !isNaN(factor)) {
      return factor * aValue;
    }

    this.logger.error(
      `No exchange rate has been found for ${aFromCurrency}${aToCurrency} at ${format(
        aDate,
        DATE_FORMAT
      )}`
    );

    return undefined;
  }

  /**
   * Batch currency conversion with grouping optimization.
   * Groups conversions by (fromCurrency, toCurrency, date) tuple to minimize database queries.
   * Implements forward-fill strategy for weekend/holiday rates.
   */
  public async batchConvert(
    conversions: {
      value: number;
      fromCurrency: string;
      toCurrency: string;
      date: Date;
    }[]
  ): Promise<
    {
      convertedValue: number | null;
      fxProviderUnavailable: boolean;
      rate: number | null;
      rateUnavailable: boolean;
      fallbackUsed: boolean;
      fallbackDate?: Date;
    }[]
  > {
    // Group conversions by unique (fromCurrency, toCurrency, date) tuple
    const grouped = this.groupConversionsByTuple(conversions);
    const providerUnavailable =
      await this.fxRateCacheService.isProviderUnavailable();

    // Map to store results by tuple key
    const resultsByTuple = new Map<
      string,
      {
        rate: number | null;
        rateUnavailable: boolean;
        fallbackUsed: boolean;
        fallbackDate?: Date;
      }
    >();

    // Fetch exchange rate for each unique tuple
    for (const [tupleKey, group] of grouped.entries()) {
      const { fromCurrency, toCurrency, date } = group.conversions[0];

      // Use existing toCurrencyAtDate method with forward-fill
      const dataSource =
        this.dataProviderService.getDataSourceForExchangeRates();
      const symbol = `${fromCurrency}${toCurrency}`;

      let factor: number | undefined;
      let fallbackUsed = false;
      let fallbackDate: Date | undefined;

      if (fromCurrency === toCurrency) {
        factor = 1;
      } else {
        const cachedRate = await this.fxRateCacheService.getCachedRate(
          symbol,
          date
        );
        const marketData =
          cachedRate !== null
            ? { marketPrice: cachedRate, isCarriedForward: false }
            : providerUnavailable
              ? null
              : await this.marketDataService.get({ dataSource, symbol, date });

        if (marketData?.marketPrice) {
          factor = marketData.marketPrice;
          fallbackUsed = marketData.isCarriedForward || false;
          if (fallbackUsed) {
            fallbackDate = date;
          } else if (cachedRate === null) {
            await this.fxRateCacheService.setCachedRate(symbol, date, factor);
          }
        } else if (!providerUnavailable) {
          // Forward-fill: previous business days within the 7-day window (weekends skipped)
          for (let i = 1; i <= 7; i++) {
            const fallbackDateCandidate = subDays(date, i);

            if (isWeekend(fallbackDateCandidate)) {
              continue;
            }

            const fallbackMarketData = await this.marketDataService.get({
              dataSource,
              symbol,
              date: fallbackDateCandidate
            });

            if (fallbackMarketData?.marketPrice) {
              factor = fallbackMarketData.marketPrice;
              fallbackUsed = true;
              fallbackDate = fallbackDateCandidate;
              break;
            }
          }
        }
      }

      const rateUnavailable = !isNumber(factor) || isNaN(factor);

      if (rateUnavailable) {
        this.logger.warn({
          event: 'fx_rate_unavailable',
          currencyPair: symbol,
          date: format(date, DATE_FORMAT)
        });
      }

      resultsByTuple.set(tupleKey, {
        rate: rateUnavailable ? null : factor,
        rateUnavailable,
        fallbackUsed,
        fallbackDate
      });
    }

    // Map results back to original order
    return conversions.map((conversion) => {
      const tupleKey = this.getTupleKey(
        conversion.fromCurrency,
        conversion.toCurrency,
        conversion.date
      );
      const result = resultsByTuple.get(tupleKey) ?? {
        rate: null,
        rateUnavailable: true,
        fallbackUsed: false
      };

      return {
        convertedValue:
          result.rate === null ? null : conversion.value * result.rate,
        fxProviderUnavailable: providerUnavailable,
        rate: result.rate,
        rateUnavailable: result.rateUnavailable,
        fallbackUsed: result.fallbackUsed,
        fallbackDate: result.fallbackDate
      };
    });
  }

  /**
   * Groups conversions by (fromCurrency, toCurrency, date) tuple.
   * Pure function for testability (COMP-001 mitigation).
   */
  private groupConversionsByTuple(
    conversions: {
      value: number;
      fromCurrency: string;
      toCurrency: string;
      date: Date;
    }[]
  ): Map<
    string,
    {
      fromCurrency: string;
      toCurrency: string;
      date: Date;
      conversions: {
        value: number;
        fromCurrency: string;
        toCurrency: string;
        date: Date;
        index: number;
      }[];
    }
  > {
    const groups = new Map<
      string,
      {
        fromCurrency: string;
        toCurrency: string;
        date: Date;
        conversions: {
          value: number;
          fromCurrency: string;
          toCurrency: string;
          date: Date;
          index: number;
        }[];
      }
    >();

    conversions.forEach((conversion, index) => {
      const key = this.getTupleKey(
        conversion.fromCurrency,
        conversion.toCurrency,
        conversion.date
      );

      if (!groups.has(key)) {
        groups.set(key, {
          fromCurrency: conversion.fromCurrency,
          toCurrency: conversion.toCurrency,
          date: conversion.date,
          conversions: []
        });
      }

      groups.get(key).conversions.push({ ...conversion, index });
    });

    return groups;
  }

  private getTupleKey(
    fromCurrency: string,
    toCurrency: string,
    date: Date
  ): string {
    return `${fromCurrency}:${toCurrency}:${format(date, DATE_FORMAT)}`;
  }

  private async prepareCurrencies(): Promise<string[]> {
    let currencies: string[] = [DEFAULT_CURRENCY];

    (
      await this.prismaService.account.findMany({
        distinct: ['currency'],
        orderBy: [{ currency: 'asc' }],
        select: { currency: true },
        where: {
          currency: {
            not: null
          }
        }
      })
    ).forEach(({ currency }) => {
      if (currency) {
        currencies.push(currency);
      }
    });

    (
      await this.prismaService.symbolProfile.findMany({
        distinct: ['currency'],
        orderBy: [{ currency: 'asc' }],
        select: { currency: true }
      })
    ).forEach(({ currency }) => {
      currencies.push(currency);
    });

    const customCurrencies =
      await this.propertyService.getByKey<string[]>(PROPERTY_CURRENCIES);

    if (customCurrencies?.length > 0) {
      currencies = currencies.concat(customCurrencies);
    }

    // Add derived currencies
    currencies.push('USX');

    for (const { currency, rootCurrency } of DERIVED_CURRENCIES) {
      if (currencies.includes(currency) || currencies.includes(rootCurrency)) {
        currencies.push(currency);
        currencies.push(rootCurrency);
      }
    }

    return Array.from(new Set(currencies)).filter(Boolean).sort();
  }

  private prepareCurrencyPairs(aCurrencies: string[]) {
    return aCurrencies
      .filter((currency) => {
        return currency !== DEFAULT_CURRENCY;
      })
      .map((currency) => {
        return {
          currency1: DEFAULT_CURRENCY,
          currency2: currency,
          dataSource: this.dataProviderService.getDataSourceForExchangeRates(),
          symbol: `${DEFAULT_CURRENCY}${currency}`
        };
      });
  }
}
