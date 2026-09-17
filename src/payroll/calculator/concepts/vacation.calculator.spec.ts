import { PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { VacationCalculator } from './vacation.calculator';

describe('VacationCalculator', () => {
  let calculator: VacationCalculator;

  beforeEach(() => {
    calculator = new VacationCalculator();
  });

  const createVacation = (
    days: string,
    description = 'Vacaciones',
  ): PayrollNovelty =>
    ({
      type: 'VACATION',
      quantity: new Prisma.Decimal(days),
      description,
    }) as unknown as PayrollNovelty;

  it('should calculate 5 vacation days', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createVacation('5'),
    ]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(Decimal.isDecimal(result.days)).toBe(true);

    expect(result.earned.toString()).toBe('500000');
    expect(result.days.toString()).toBe('5');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].amount.toString()).toBe('500000');
  });

  it('should calculate 15 vacation days', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createVacation('15'),
    ]);

    expect(result.earned.toString()).toBe('1500000');
    expect(result.days.toString()).toBe('15');
  });

  it('should calculate fractional vacation days exactly', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createVacation('7.5'),
    ]);

    expect(result.earned.toString()).toBe('750000');
    expect(result.days.toString()).toBe('7.5');
  });

  it('should ignore vacation with zero days', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createVacation('0'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should ignore vacation with negative days', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createVacation('-5'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should sum multiple vacation novelties exactly', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createVacation('3', 'Primeras vacaciones'),
      createVacation('2.5', 'Vacaciones adicionales'),
    ]);

    expect(result.earned.toString()).toBe('550000');
    expect(result.days.toString()).toBe('5.5');
    expect(result.concepts).toHaveLength(2);
  });

  it('should ignore non vacation novelties', () => {
    const novelty = {
      type: 'BONUS',
      quantity: new Prisma.Decimal('5'),
    } as unknown as PayrollNovelty;

    const result = calculator.calculate(new Decimal('3000000'), [novelty]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});