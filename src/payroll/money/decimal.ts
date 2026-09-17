import Decimal from 'decimal.js';

export type DecimalSource =
  | string
  | number
  | Decimal
  | { toString(): string };

export function toDecimal(value: DecimalSource): Decimal {
  if (Decimal.isDecimal(value)) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return new Decimal(value);
  }

  return new Decimal(value.toString());
}