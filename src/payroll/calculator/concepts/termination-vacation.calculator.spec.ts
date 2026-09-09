import { TerminationVacationCalculator } from './termination-vacation.calculator';

describe('TerminationVacationCalculator', () => {
  let calculator: TerminationVacationCalculator;

  beforeEach(() => {
    calculator = new TerminationVacationCalculator();
  });

  it('should calculate pending vacation compensation', () => {
    const result = calculator.calculate(3000000, 15);

    expect(result.earned).toBe(1500000);
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].code).toBe('TERMINATION_VACATION');
  });

  it('should calculate fractional vacation days', () => {
    const result = calculator.calculate(3000000, 7.5);

    expect(result.earned).toBe(750000);
  });

  it('should return zero when pending vacation days are zero', () => {
    const result = calculator.calculate(3000000, 0);

    expect(result).toEqual({
      earned: 0,
      concepts: [],
    });
  });

  it('should return zero when base salary is zero', () => {
    const result = calculator.calculate(0, 15);

    expect(result).toEqual({
      earned: 0,
      concepts: [],
    });
  });
});
