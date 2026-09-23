import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { HealthCalculator } from './health.calculator';

describe('HealthCalculator', () => {
  let calculator: HealthCalculator;

  beforeEach(() => {
    calculator = new HealthCalculator();
  });

  it('should calculate 4% employee health contribution', () => {
    const result = calculator.calculate(new Decimal('3000000'));

    expect(Decimal.isDecimal(result.deductions)).toBe(true);
    expect(result.deductions.toString()).toBe('120000');

    expect(result.concepts).toHaveLength(1);

    expect(result.concepts[0]).toEqual({
      code: 'HEALTH',
      name: 'Aporte salud empleado',
      type: ConceptType.DEDUCTION,
      amount: new Decimal('120000'),
    });
  });

  it('should calculate fractional contributions exactly', () => {
    const result = calculator.calculate(new Decimal('23345.4'));

    expect(Decimal.isDecimal(result.deductions)).toBe(true);
    expect(result.deductions.toString()).toBe('933.816');

    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });
});
