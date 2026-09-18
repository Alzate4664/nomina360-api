import Decimal from 'decimal.js';
import { TerminationVacationCalculator } from './termination-vacation.calculator';

describe('TerminationVacationCalculator', () => {
  let calculator: TerminationVacationCalculator;

  beforeEach(() => {
    calculator = new TerminationVacationCalculator();
  });

  it('should calculate pending vacation compensation', () => {
    const result = calculator.calculate(
      new Decimal('3000000'),
      new Decimal('15'),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('1500000');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].code).toBe('TERMINATION_VACATION');

    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
    expect(result.concepts[0].amount.toString()).toBe('1500000');
  });

  it('should calculate fractional vacation days exactly', () => {
    const result = calculator.calculate(
      new Decimal('3000000'),
      new Decimal('7.5'),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('750000');
  });

  it('should avoid IEEE-754 noise with a problematic salary', () => {
    const result = calculator.calculate(
      new Decimal('700362'),
      new Decimal('1'),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('23345.4');

    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
    expect(result.concepts[0].amount.toString()).toBe('23345.4');
  });

  it('should return Decimal zero when pending vacation days are zero', () => {
    const result = calculator.calculate(
      new Decimal('3000000'),
      new Decimal('0'),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should return Decimal zero when base salary is zero', () => {
    const result = calculator.calculate(new Decimal('0'), new Decimal('15'));

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it.each([
    ['0.1', '10000'],
    ['0.10000000000000001', '10000.000000000001'],
  ])('should preserve Decimal vacation days %s', (days, expectedAmount) => {
    const result = calculator.calculate(
      new Decimal('3000000'),
      new Decimal(days),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe(expectedAmount);
    expect(result.concepts).toHaveLength(1);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
    expect(result.concepts[0].amount.toString()).toBe(expectedAmount);
  });

  it('should return Decimal zero when pending vacation days are negative', () => {
    const result = calculator.calculate(
      new Decimal('3000000'),
      new Decimal('-0.5'),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});
