import { PAYROLL_RATES } from './config/payroll-rates.config';
import { SeveranceCalculator } from './concepts/severance.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';
import { SeverancePayrollCalculator } from './severance-payroll.calculator';

describe('SeverancePayrollCalculator', () => {
  let calculator: SeverancePayrollCalculator;

  beforeEach(() => {
    calculator = new SeverancePayrollCalculator(
      new SeveranceCalculator(),
      new TransportAllowanceCalculator(),
    );
  });

  it('should include transport allowance in severance base for eligible employee', () => {
    const result = calculator.calculate({
      baseSalary: PAYROLL_RATES.minimumWage,
      accruedDays: 360,
    });

    const expectedBase =
      PAYROLL_RATES.minimumWage +
      PAYROLL_RATES.transportAllowance.monthlyAmount;

    expect(result.severanceBase).toBe(expectedBase);
    expect(result.earnedTotal).toBeGreaterThan(0);
    expect(result.deductionsTotal).toBe(0);
    expect(result.netPay).toBe(result.earnedTotal);
  });

  it('should exclude transport allowance from severance base above salary limit', () => {
    const salaryLimit =
      PAYROLL_RATES.minimumWage *
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages;

    const baseSalary = salaryLimit + 1;

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 360,
    });

    expect(result.severanceBase).toBe(baseSalary);
  });

  it('should calculate proportional severance payroll', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      accruedDays: 180,
    });

    expect(result.earnedTotal).toBeGreaterThan(0);
    expect(result.netPay).toBe(result.earnedTotal);
    expect(result.concepts).toHaveLength(2);
  });
});
