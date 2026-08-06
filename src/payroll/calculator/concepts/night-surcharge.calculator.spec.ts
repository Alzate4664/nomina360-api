import { ConceptType } from '@prisma/client';
import { NightSurchargeCalculator } from './night-surcharge.calculator';

describe('NightSurchargeCalculator', () => {
  let calculator: NightSurchargeCalculator;

  beforeEach(() => {
    calculator = new NightSurchargeCalculator();
  });

  it('should calculate nighttime surcharge using the configured rate', () => {
    const baseSalary = 2100000;

    const result = calculator.calculate(baseSalary, [
      {
        id: 'novelty-1',
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: 'NIGHT_SURCHARGE',
        quantity: 2,
        amount: null,
        description: '2 horas recargo nocturno',
        createdAt: new Date(),
      },
    ]);

    expect(result.earned).toBe(7000);

    expect(result.concepts).toEqual([
      {
        code: 'NIGHT_SURCHARGE',
        name: '2 horas recargo nocturno',
        type: ConceptType.EARNING,
        amount: 7000,
      },
    ]);
  });
});