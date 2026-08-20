import { PayrollDayType } from '@prisma/client';
import { VacationCalculator } from './vacation.calculator';

describe('VacationCalculator', () => {
  let calculator: VacationCalculator;

  beforeEach(() => {
    calculator = new VacationCalculator();
  });

  const createVacation = (days: number, description = 'Vacaciones') => ({
    id: 'novelty-1',
    companyId: 'company-1',
    employeeId: 'employee-1',
    payrollPeriodId: 'period-1',
    type: 'VACATION' as const,
    dayType: PayrollDayType.REGULAR,
    sickLeaveOrigin: null,
    sickLeaveStartDay: null,
    sickLeaveIbc: null,
    quantity: days,
    amount: null,
    description,
    createdAt: new Date(),
  });

  it('should calculate 5 vacation days', () => {
    const result = calculator.calculate(3000000, [createVacation(5)]);

    expect(result.earned).toBe(500000);
    expect(result.days).toBe(5);

    expect(result.concepts).toEqual([
      {
        code: 'VACATION',
        name: 'Vacaciones',
        type: 'EARNING',
        amount: 500000,
      },
    ]);
  });

  it('should calculate 15 vacation days', () => {
    const result = calculator.calculate(3000000, [createVacation(15)]);

    expect(result.earned).toBe(1500000);
    expect(result.days).toBe(15);
    expect(result.concepts).toHaveLength(1);
  });

  it('should ignore vacation with zero days', () => {
    const result = calculator.calculate(3000000, [createVacation(0)]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should ignore vacation with negative days', () => {
    const result = calculator.calculate(3000000, [createVacation(-5)]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should sum multiple vacation novelties', () => {
    const result = calculator.calculate(3000000, [
      createVacation(3, 'Primeras vacaciones'),
      createVacation(2, 'Vacaciones adicionales'),
    ]);

    expect(result.earned).toBe(500000);
    expect(result.days).toBe(5);
    expect(result.concepts).toHaveLength(2);
  });

  it('should ignore non vacation novelties', () => {
    const novelty = {
      ...createVacation(5),
      type: 'BONUS' as const,
    };

    const result = calculator.calculate(3000000, [novelty]);

    expect(result.earned).toBe(0);
    expect(result.days).toBe(0);
    expect(result.concepts).toEqual([]);
  });
});
