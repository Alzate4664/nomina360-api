import {
  LeaveType,
  PayrollNovelty,
  Prisma,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { LeaveCalculator } from './leave.calculator';

describe('LeaveCalculator', () => {
  let calculator: LeaveCalculator;

  beforeEach(() => {
    calculator = new LeaveCalculator();
  });

  const createLeave = (
    leaveType: LeaveType,
    days: string,
    description = 'Licencia',
  ): PayrollNovelty =>
    ({
      type: 'LEAVE',
      leaveType,
      quantity: new Prisma.Decimal(days),
      description,
    }) as unknown as PayrollNovelty;

  it('should calculate paid leave', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createLeave(LeaveType.PAID, '3'),
    ]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(Decimal.isDecimal(result.days)).toBe(true);

    expect(result.earned.toString()).toBe('300000');
    expect(result.days.toString()).toBe('3');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].amount.toString()).toBe('300000');
  });

  it('should not generate earnings for unpaid leave', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createLeave(LeaveType.UNPAID, '3'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('3');
    expect(result.concepts).toEqual([]);
  });

  it('should calculate fractional paid leave exactly', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createLeave(LeaveType.PAID, '1.5'),
    ]);

    expect(result.earned.toString()).toBe('150000');
    expect(result.days.toString()).toBe('1.5');
  });

  it('should ignore leave with zero days', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createLeave(LeaveType.PAID, '0'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should ignore leave with negative days', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createLeave(LeaveType.PAID, '-2'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should sum paid and unpaid leave days correctly', () => {
    const result = calculator.calculate(new Decimal('3000000'), [
      createLeave(LeaveType.PAID, '2'),
      createLeave(LeaveType.UNPAID, '3'),
    ]);

    expect(result.earned.toString()).toBe('200000');
    expect(result.days.toString()).toBe('5');
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].amount.toString()).toBe('200000');
  });

  it('should ignore non leave novelties', () => {
    const novelty = {
      type: 'VACATION',
      leaveType: null,
      quantity: new Prisma.Decimal('3'),
    } as unknown as PayrollNovelty;

    const result = calculator.calculate(new Decimal('3000000'), [novelty]);

    expect(result.earned.toString()).toBe('0');
    expect(result.days.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});