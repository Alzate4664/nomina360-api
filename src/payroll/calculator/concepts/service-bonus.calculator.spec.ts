import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { ServiceBonusCalculator } from './service-bonus.calculator';

describe('ServiceBonusCalculator', () => {
  let calculator: ServiceBonusCalculator;

  beforeEach(() => {
    calculator = new ServiceBonusCalculator();
  });

  it('should calculate service bonus for 180 accrued days', () => {
    const result = calculator.calculate(new Decimal('3000000'), 180);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('1500000');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]).toEqual({
      code: 'SERVICE_BONUS',
      name: 'Prima de servicios',
      type: ConceptType.EARNING,
      amount: new Decimal('1500000'),
    });
  });

  it('should calculate proportional service bonus exactly', () => {
    const result = calculator.calculate(new Decimal('3000000'), 90);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('750000');
  });

  it('should include transport allowance in calculation base', () => {
    const result = calculator.calculate(
      new Decimal('1750905'),
      180,
      new Decimal('249095'),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('1000000');
  });

  it('should avoid IEEE-754 noise in proportional calculations', () => {
    const result = calculator.calculate(new Decimal('700362'), 1);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('1945.45');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });

  it('should return Decimal zero for zero accrued days', () => {
    const result = calculator.calculate(new Decimal('3000000'), 0);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should return Decimal zero for negative accrued days', () => {
    const result = calculator.calculate(new Decimal('3000000'), -10);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});