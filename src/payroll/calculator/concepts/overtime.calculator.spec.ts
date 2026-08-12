import { ConceptType } from '@prisma/client';
import { OvertimeCalculator } from './overtime.calculator';

describe('OvertimeCalculator', () => {
  let calculator: OvertimeCalculator;

  beforeEach(() => {
    calculator = new OvertimeCalculator();
  });

  it('should calculate daytime overtime using the configured multiplier', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-1',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'OVERTIME',
        quantity: 2,
        amount: null,
        description: '2 horas extra diurnas',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(25000);

    expect(result.concepts).toEqual([
      {
        code: 'OVERTIME',
        name: '2 horas extra diurnas',
        type: ConceptType.EARNING,
        amount: 25000,
      },
    ]);
  });

  it('should calculate nighttime overtime using the configured multiplier', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-2',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'OVERTIME_NIGHT',
        quantity: 2,
        amount: null,
        description: '2 horas extra nocturnas',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(35000);

    expect(result.concepts).toEqual([
      {
        code: 'OVERTIME_NIGHT',
        name: '2 horas extra nocturnas',
        type: ConceptType.EARNING,
        amount: 35000,
      },
    ]);
  });
});
