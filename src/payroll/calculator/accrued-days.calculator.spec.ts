import { AccruedDaysCalculator } from './accrued-days.calculator';

describe('AccruedDaysCalculator', () => {
  let calculator: AccruedDaysCalculator;

  beforeEach(() => {
    calculator = new AccruedDaysCalculator();
  });

  it('should calculate 360 days for a complete year', () => {
    const result = calculator.calculate(
      new Date('2025-06-15T00:00:00.000Z'),
      2026,
      12,
    );

    expect(result).toBe(360);
  });

  it('should calculate 180 days for the second semester', () => {
    const result = calculator.calculate(
      new Date('2026-07-01T00:00:00.000Z'),
      2026,
      12,
      7,
    );

    expect(result).toBe(180);
  });

  it('should calculate days from employee start date', () => {
    const result = calculator.calculate(
      new Date('2026-07-15T00:00:00.000Z'),
      2026,
      12,
      7,
    );

    expect(result).toBe(166);
  });

  it('should return zero when employee starts after the period', () => {
    const result = calculator.calculate(
      new Date('2027-01-01T00:00:00.000Z'),
      2026,
      12,
    );

    expect(result).toBe(0);
  });

  it('should calculate through the selected month', () => {
    const result = calculator.calculate(
      new Date('2026-01-01T00:00:00.000Z'),
      2026,
      8,
    );

    expect(result).toBe(240);
  });

  it('should include the employee start day', () => {
    const result = calculator.calculate(
      new Date('2026-08-30T00:00:00.000Z'),
      2026,
      8,
    );

    expect(result).toBe(1);
  });
});
