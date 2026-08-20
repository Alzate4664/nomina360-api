import { ConceptType } from '@prisma/client';
import { ServiceBonusCalculator } from './service-bonus.calculator';

describe('ServiceBonusCalculator', () => {
  let calculator: ServiceBonusCalculator;

  beforeEach(() => {
    calculator = new ServiceBonusCalculator();
  });

  it('should calculate service bonus for 180 accrued days', () => {
    const result = calculator.calculate(3000000, 180);

    expect(result.earned).toBe(1500000);
    expect(result.concepts).toEqual([
      {
        code: 'SERVICE_BONUS',
        name: 'Prima de servicios',
        type: ConceptType.EARNING,
        amount: 1500000,
      },
    ]);
  });

  it('should calculate proportional service bonus', () => {
    const result = calculator.calculate(3000000, 90);

    expect(result.earned).toBe(750000);
  });

  it('should include transport allowance in calculation base', () => {
    const result = calculator.calculate(1750905, 180, 249095);

    expect(result.earned).toBe(1000000);
  });

  it('should return zero for zero accrued days', () => {
    const result = calculator.calculate(3000000, 0);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should return zero for negative accrued days', () => {
    const result = calculator.calculate(3000000, -10);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });
});
