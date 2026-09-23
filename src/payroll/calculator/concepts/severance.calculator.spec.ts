import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { SeveranceCalculator } from './severance.calculator';

describe('SeveranceCalculator', () => {
  let calculator: SeveranceCalculator;

  beforeEach(() => {
    calculator = new SeveranceCalculator();
  });

  it('should calculate severance for 360 days', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('3000000'),
      accruedDays: 360,
    });

    expect(Decimal.isDecimal(result.severance)).toBe(true);
    expect(result.severance.toString()).toBe('3000000');

    expect(result.concepts).toHaveLength(2);

    expect(result.concepts[0]).toEqual({
      code: 'SEVERANCE',
      name: 'Cesantías',
      type: ConceptType.EARNING,
      amount: new Decimal('3000000'),
    });
  });

  it('should calculate proportional severance', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('3000000'),
      accruedDays: 180,
    });

    expect(Decimal.isDecimal(result.severance)).toBe(true);
    expect(result.severance.toString()).toBe('1500000');
  });

  it('should calculate severance interest', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('3000000'),
      accruedDays: 360,
    });

    expect(Decimal.isDecimal(result.interest)).toBe(true);
    expect(result.interest.toString()).toBe('360000');

    expect(result.concepts[1]).toEqual({
      code: 'SEVERANCE_INTEREST',
      name: 'Intereses de cesantías',
      type: ConceptType.EARNING,
      amount: new Decimal('360000'),
    });
  });

  it('should calculate proportional severance interest', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('3000000'),
      accruedDays: 180,
    });

    expect(result.interest.toString()).toBe('90000');
  });

  it('should preserve exact decimal arithmetic', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('700362'),
      accruedDays: 1,
    });

    expect(Decimal.isDecimal(result.severance)).toBe(true);
    expect(Decimal.isDecimal(result.interest)).toBe(true);
    expect(Decimal.isDecimal(result.total)).toBe(true);

    expect(result.severance.toString()).toBe('1945.45');
  });

  it('should return Decimal zero values when accrued days are zero', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('3000000'),
      accruedDays: 0,
    });

    expect(Decimal.isDecimal(result.severance)).toBe(true);
    expect(Decimal.isDecimal(result.interest)).toBe(true);
    expect(Decimal.isDecimal(result.total)).toBe(true);

    expect(result.severance.toString()).toBe('0');
    expect(result.interest.toString()).toBe('0');
    expect(result.total.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should return Decimal zero values when accrued days are negative', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('3000000'),
      accruedDays: -10,
    });

    expect(result.severance.toString()).toBe('0');
    expect(result.interest.toString()).toBe('0');
    expect(result.total.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should return Decimal zero values when severance base is invalid', () => {
    const result = calculator.calculate({
      severanceBase: new Decimal('0'),
      accruedDays: 360,
    });

    expect(result.severance.toString()).toBe('0');
    expect(result.interest.toString()).toBe('0');
    expect(result.total.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});
