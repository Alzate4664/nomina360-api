import { LeaveType, PayrollDayType, PayrollNovelty } from '@prisma/client';
import { LeaveCalculator } from './leave.calculator';

describe('LeaveCalculator', () => {
  let calculator: LeaveCalculator;

  beforeEach(() => {
    calculator = new LeaveCalculator();
  });

  const createLeave = (
    leaveType: LeaveType,
    days: number,
    description = 'Licencia',
  ): PayrollNovelty => ({
    id: 'novelty-1',
    companyId: 'company-1',
    employeeId: 'employee-1',
    payrollPeriodId: 'period-1',
    type: 'LEAVE',
    dayType: PayrollDayType.REGULAR,
    sickLeaveOrigin: null,
    sickLeaveStartDay: null,
    sickLeaveIbc: null,
    leaveType,
    quantity: days,
    amount: null,
    description,
    createdAt: new Date(),
  });

  it('should calculate paid leave', () => {
    const result = calculator.calculate(3000000, [
      createLeave(LeaveType.PAID, 3),
    ]);

    expect(result.earned).toBe(300000);
    expect(result.days).toBe(3);

    expect(result.concepts).toEqual([
      {
        code: 'LEAVE',
        name: 'Licencia',
        type: 'EARNING',
        amount: 300000,
      },
    ]);
  });

  it('should not generate earnings for unpaid leave', () => {
    const result = calculator.calculate(3000000, [
      createLeave(LeaveType.UNPAID, 3),
    ]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(3);
    expect(result.concepts).toEqual([]);
  });

  it('should ignore leave with zero days', () => {
    const result = calculator.calculate(3000000, [
      createLeave(LeaveType.PAID, 0),
    ]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should ignore leave with negative days', () => {
    const result = calculator.calculate(3000000, [
      createLeave(LeaveType.PAID, -2),
    ]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should sum paid and unpaid leave days correctly', () => {
    const result = calculator.calculate(3000000, [
      createLeave(LeaveType.PAID, 2),
      createLeave(LeaveType.UNPAID, 3),
    ]);

    expect(result.earned).toBe(200000);
    expect(result.days).toBe(5);
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].amount).toBe(200000);
  });

  it('should ignore non leave novelties', () => {
    const novelty = {
      ...createLeave(LeaveType.PAID, 3),
      type: 'VACATION',
      leaveType: null,
    } as PayrollNovelty;

    const result = calculator.calculate(3000000, [novelty]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(0);
    expect(result.concepts).toEqual([]);
  });
});
