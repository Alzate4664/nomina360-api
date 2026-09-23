import Decimal from 'decimal.js';
import { toDecimal } from './decimal';

describe('toDecimal', () => {
  it('should preserve an exact decimal string', () => {
    const value = toDecimal('377777.77777777775');

    expect(value.toString()).toBe('377777.77777777775');
  });

  it('should convert a Decimal instance without changing its value', () => {
    const original = new Decimal('1851371.52657142');

    const result = toDecimal(original);

    expect(result.toString()).toBe('1851371.52657142');
  });

  it('should convert a Prisma-like Decimal through toString()', () => {
    const prismaDecimal = {
      toString: () => '1377777.7777777775',
    };

    const result = toDecimal(prismaDecimal);

    expect(result.toString()).toBe('1377777.7777777775');
  });

  it('should add decimal values exactly', () => {
    const result = toDecimal('0.1').plus(toDecimal('0.2'));

    expect(result.toString()).toBe('0.3');
  });

  it('should multiply decimal values without IEEE-754 noise', () => {
    const result = toDecimal('23345.4').times('0.04');

    expect(result.toString()).toBe('933.816');
  });

  it('should preserve useful precision in division', () => {
    const result = toDecimal('1750905').dividedBy(30);

    expect(result.toString()).toBe('58363.5');
  });

  it('should distinguish exact decimal input from an already contaminated number', () => {
    const exact = toDecimal('23345.4');
    const contaminated = toDecimal(23345.399999999998);

    expect(exact.toString()).toBe('23345.4');
    expect(contaminated.toString()).toBe('23345.399999999998');
  });
});
