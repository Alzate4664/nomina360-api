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
        dayType: 'REGULAR',
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
        dayType: 'REGULAR',
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

  it('should calculate daytime overtime on sunday using combined surcharges', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-3',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'OVERTIME',
        dayType: 'SUNDAY',
        quantity: 2,
        amount: null,
        description: '2 horas extra diurnas dominicales',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(43000);

    expect(result.concepts).toEqual([
      {
        code: 'OVERTIME',
        name: '2 horas extra diurnas dominicales',
        type: ConceptType.EARNING,
        amount: 43000,
      },
    ]);
  });

  it('should calculate nighttime overtime on holiday using combined surcharges', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-4',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'OVERTIME_NIGHT',
        dayType: 'HOLIDAY',
        quantity: 2,
        amount: null,
        description: '2 horas extra nocturnas festivas',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(53000);

    expect(result.concepts).toEqual([
      {
        code: 'OVERTIME_NIGHT',
        name: '2 horas extra nocturnas festivas',
        type: ConceptType.EARNING,
        amount: 53000,
      },
    ]);
  });
});
