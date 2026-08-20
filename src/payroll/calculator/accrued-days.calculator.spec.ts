import { AccruedDaysCalculator } from './accrued-days.calculator';

describe('AccruedDaysCalculator', () => {
  let calculator: AccruedDaysCalculator;

  beforeEach(() => {
    calculator = new AccruedDaysCalculator();
  });

  it('should calculate full year for employee hired before the year', () => {
    const result = calculator.calculate(
      new Date('2025-06-15T00:00:00.000Z'),
      2026,
      12,
    );

    expect(result).toBe(365);
  });

  it('should calculate days from employee start date', () => {
    const result = calculator.calculate(
      new Date('2026-07-01T00:00:00.000Z'),
      2026,
      12,
    );

    expect(result).toBe(184);
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

    expect(result).toBe(243);
  });

  it('should include the employee start day', () => {
    const result = calculator.calculate(
      new Date('2026-08-31T00:00:00.000Z'),
      2026,
      8,
    );

    expect(result).toBe(1);
  });
});
