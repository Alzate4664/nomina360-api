import { ConceptType } from '@prisma/client';
import { SundayHolidayCalculator } from './sunday-holiday.calculator';

describe('SundayHolidayCalculator', () => {
  let calculator: SundayHolidayCalculator;

  beforeEach(() => {
    calculator = new SundayHolidayCalculator();
  });

  it('should calculate sunday surcharge using the configured rate', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-1',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'SUNDAY_SURCHARGE',
        quantity: 2,
        amount: null,
        description: '2 horas dominicales',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(18000);

    expect(result.concepts).toEqual([
      {
        code: 'SUNDAY_SURCHARGE',
        name: '2 horas dominicales',
        type: ConceptType.EARNING,
        amount: 18000,
      },
    ]);
  });

  it('should calculate holiday surcharge using the configured rate', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-2',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'HOLIDAY_SURCHARGE',
        quantity: 2,
        amount: null,
        description: '2 horas festivas',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(18000);

    expect(result.concepts).toEqual([
      {
        code: 'HOLIDAY_SURCHARGE',
        name: '2 horas festivas',
        type: ConceptType.EARNING,
        amount: 18000,
      },
    ]);
  });
});