import Decimal from 'decimal.js';
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
      baseSalary: new Decimal(PAYROLL_RATES.minimumWage),
      accruedDays: 360,
    });

    const expectedBase = new Decimal(PAYROLL_RATES.minimumWage).plus(
      PAYROLL_RATES.transportAllowance.monthlyAmount,
    );

    expect(Decimal.isDecimal(result.severanceBase)).toBe(true);
    expect(result.severanceBase.toString()).toBe(expectedBase.toString());

    expect(Decimal.isDecimal(result.earnedTotal)).toBe(true);
    expect(result.earnedTotal.gt(0)).toBe(true);

    expect(Decimal.isDecimal(result.deductionsTotal)).toBe(true);
    expect(result.deductionsTotal.toString()).toBe('0');

    expect(result.netPay.eq(result.earnedTotal)).toBe(true);
  });

  it('should exclude transport allowance from severance base above salary limit', () => {
    const salaryLimit = new Decimal(PAYROLL_RATES.minimumWage).times(
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages,
    );

    const baseSalary = salaryLimit.plus(1);

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 360,
    });

    expect(result.severanceBase.toString()).toBe(baseSalary.toString());
  });

  it('should calculate proportional severance payroll', () => {
    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      accruedDays: 180,
    });

    expect(result.earnedTotal.gt(0)).toBe(true);
    expect(result.netPay.eq(result.earnedTotal)).toBe(true);
    expect(result.concepts).toHaveLength(2);
  });
});