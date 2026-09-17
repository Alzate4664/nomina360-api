import { BaseSalaryCalculator } from './base-salary.calculator';

describe('BaseSalaryCalculator', () => {
  let calculator: BaseSalaryCalculator;

  beforeEach(() => {
    calculator = new BaseSalaryCalculator();
  });

  it('should calculate the full monthly salary for 30 worked days', () => {
    const result = calculator.calculate(3000000, 30);

    expect(result.earned).toBe(3000000);
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]).toEqual({
      code: 'BASE_SALARY',
      name: 'Salario ordinario',
      type: 'EARNING',
      amount: 3000000,
    });
  });

  it('should calculate a proportional salary', () => {
    const result = calculator.calculate(3000000, 15);

    expect(result.earned).toBe(1500000);
    expect(result.concepts[0].amount).toBe(1500000);
  });

  it('should preserve the current fractional result', () => {
    const result = calculator.calculate(1750905, 1);

    expect(result.earned).toBe(58363.5);
    expect(result.concepts[0].amount).toBe(58363.5);
  });

  it('should expose IEEE-754 noise with a problematic salary', () => {
    const result = calculator.calculate(700362, 1);

    expect(result.earned).toBe(23345.4);
    expect(result.earned.toPrecision(20)).toBe('23345.400000000001455');
  });
});