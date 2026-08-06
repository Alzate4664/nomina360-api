import { ConceptType } from '@prisma/client';
import { HealthCalculator } from './health.calculator';

describe('HealthCalculator', () => {
  let calculator: HealthCalculator;

  beforeEach(() => {
    calculator = new HealthCalculator();
  });

  it('should calculate 4% employee health contribution', () => {
    const result = calculator.calculate(3000000);

    expect(result.deductions).toBe(120000);

    expect(result.concepts).toEqual([
      {
        code: 'HEALTH',
        name: 'Aporte salud empleado',
        type: ConceptType.DEDUCTION,
        amount: 120000,
      },
    ]);
  });
});