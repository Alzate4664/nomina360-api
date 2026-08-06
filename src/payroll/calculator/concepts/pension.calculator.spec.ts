import { ConceptType } from '@prisma/client';
import { PensionCalculator } from './pension.calculator';

describe('PensionCalculator', () => {
  let calculator: PensionCalculator;

  beforeEach(() => {
    calculator = new PensionCalculator();
  });

  it('should calculate 4% employee pension contribution', () => {
    const result = calculator.calculate(3000000);

    expect(result.deductions).toBe(120000);

    expect(result.concepts).toEqual([
      {
        code: 'PENSION',
        name: 'Aporte pensión empleado',
        type: ConceptType.DEDUCTION,
        amount: 120000,
      },
    ]);
  });
});