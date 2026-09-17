import Decimal from 'decimal.js';
import { BaseSalaryCalculator } from './base-salary.calculator';

describe('BaseSalaryCalculator', () => {
  let calculator: BaseSalaryCalculator;

  beforeEach(() => {
    calculator = new BaseSalaryCalculator();
  });

  it('should calculate the full monthly salary for 30 worked days', () => {
    const result = calculator.calculate(new Decimal('3000000'), 30);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);

    expect(result.earned.toString()).toBe('3000000');
    expect(result.concepts).toHaveLength(1);

    expect(result.concepts[0]).toEqual({
      code: 'BASE_SALARY',
      name: 'Salario ordinario',
      type: 'EARNING',
      amount: new Decimal('3000000'),
    });
  });

  it('should calculate a proportional salary exactly', () => {
    const result = calculator.calculate(new Decimal('3000000'), 15);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);

    expect(result.earned.toString()).toBe('1500000');
    expect(result.concepts[0].amount.toString()).toBe('1500000');
  });

  it('should preserve an exact fractional monetary result', () => {
    const result = calculator.calculate(new Decimal('1750905'), 1);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);

    expect(result.earned.toString()).toBe('58363.5');
    expect(result.concepts[0].amount.toString()).toBe('58363.5');
  });

  it('should avoid IEEE-754 noise for a previously problematic salary', () => {
    const result = calculator.calculate(new Decimal('700362'), 1);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);

    expect(result.earned.toString()).toBe('23345.4');
    expect(result.concepts[0].amount.toString()).toBe('23345.4');
  });
});