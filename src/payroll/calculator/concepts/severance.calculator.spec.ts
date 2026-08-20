import { ConceptType } from '@prisma/client';
import { PAYROLL_RATES } from '../config/payroll-rates.config';
import { SeveranceCalculator } from './severance.calculator';

describe('SeveranceCalculator', () => {
  let calculator: SeveranceCalculator;

  beforeEach(() => {
    calculator = new SeveranceCalculator();
  });

  it('should calculate severance for 360 days', () => {
    const result = calculator.calculate({
      severanceBase: 3000000,
      accruedDays: 360,
    });

    expect(result.severance).toBe(3000000);

    expect(result.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SEVERANCE',
          name: 'Cesantías',
          type: ConceptType.EARNING,
          amount: 3000000,
        }),
      ]),
    );
  });

  it('should calculate proportional severance', () => {
    const result = calculator.calculate({
      severanceBase: 3000000,
      accruedDays: 180,
    });

    expect(result.severance).toBe(1500000);
  });

  it('should calculate severance interest', () => {
    const result = calculator.calculate({
      severanceBase: 3000000,
      accruedDays: 360,
    });

    const expectedInterest =
      3000000 * PAYROLL_RATES.severance.interestAnnualRate;

    expect(result.interest).toBe(expectedInterest);

    expect(result.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SEVERANCE_INTEREST',
          name: 'Intereses de cesantías',
          type: ConceptType.EARNING,
          amount: expectedInterest,
        }),
      ]),
    );
  });

  it('should calculate proportional severance interest', () => {
    const result = calculator.calculate({
      severanceBase: 3000000,
      accruedDays: 180,
    });

    expect(result.interest).toBe(90000);
  });

  it('should return zero values when accrued days are zero', () => {
    const result = calculator.calculate({
      severanceBase: 3000000,
      accruedDays: 0,
    });

    expect(result.severance).toBe(0);
    expect(result.interest).toBe(0);
    expect(result.total).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should return zero values when accrued days are negative', () => {
    const result = calculator.calculate({
      severanceBase: 3000000,
      accruedDays: -10,
    });

    expect(result.severance).toBe(0);
    expect(result.interest).toBe(0);
    expect(result.total).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should return zero values when severance base is invalid', () => {
    const result = calculator.calculate({
      severanceBase: 0,
      accruedDays: 360,
    });

    expect(result.severance).toBe(0);
    expect(result.interest).toBe(0);
    expect(result.total).toBe(0);
    expect(result.concepts).toEqual([]);
  });
});
