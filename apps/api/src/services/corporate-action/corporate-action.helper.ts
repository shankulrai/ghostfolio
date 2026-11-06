import { resetHours } from '@ghostfolio/common/helper';

import { DataSource } from '@prisma/client';
import Big from 'big.js';

export function normalizeRatio(
  numerator: number,
  denominator: number
): { denominator: number; numerator: number } {
  if (
    numerator <= 0 ||
    denominator <= 0 ||
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator)
  ) {
    throw new Error(
      'Invalid ratio: numerator and denominator must be positive integers'
    );
  }

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(numerator, denominator);

  return {
    denominator: denominator / divisor,
    numerator: numerator / divisor
  };
}

export function toUtcCalendarDay(timestamp: Date): Date {
  const utcYear = timestamp.getUTCFullYear();
  const utcMonth = timestamp.getUTCMonth();
  const utcDate = timestamp.getUTCDate();

  const localCalendarDate = new Date(utcYear, utcMonth, utcDate);

  return resetHours(localCalendarDate);
}

export function buildIdempotencyKey({
  dataSource,
  date,
  symbol,
  type
}: {
  dataSource: DataSource;
  date: Date;
  symbol: string;
  type: string;
}): string {
  const dateString = date.toISOString().split('T')[0];
  return `${dataSource}:${symbol}:${type}:${dateString}`;
}

export function calculateExDateBasisQuantity({
  exDate,
  orders,
  splits = []
}: {
  exDate: Date;
  orders: { date: Date; quantity: number; type: string }[];
  splits?: { date: Date; denominator: number; numerator: number }[];
}): number {
  let quantity = new Big(0);

  for (const order of orders) {
    if (order.date >= exDate) {
      continue;
    }

    let factor = new Big(1);

    for (const split of splits) {
      if (split.date > order.date && split.date <= exDate) {
        factor = factor.times(split.numerator).div(split.denominator);
      }
    }

    const adjustedQuantity = new Big(order.quantity).times(factor);

    if (order.type === 'BUY') {
      quantity = quantity.plus(adjustedQuantity);
    } else if (order.type === 'SELL') {
      quantity = quantity.minus(adjustedQuantity);
    }
  }

  return quantity.toNumber();
}

export function convertDividendAmount({
  amountPerShare,
  laterSplits
}: {
  amountPerShare: number;
  laterSplits: { denominator: number; numerator: number }[];
}): number {
  let adjustedAmount = new Big(amountPerShare);

  for (const split of laterSplits) {
    adjustedAmount = adjustedAmount
      .times(split.numerator)
      .div(split.denominator);
  }

  return adjustedAmount.toNumber();
}

export function isDividendWithinProximity({
  candidateDate,
  existingDividends,
  proximityDays
}: {
  candidateDate: Date;
  existingDividends: { date: Date }[];
  proximityDays: number;
}): boolean {
  const candidateTime = candidateDate.getTime();
  const proximityMs = proximityDays * 24 * 60 * 60 * 1000;

  for (const existing of existingDividends) {
    const existingTime = existing.date.getTime();
    const diff = Math.abs(candidateTime - existingTime);

    if (diff <= proximityMs) {
      return true;
    }
  }

  return false;
}
