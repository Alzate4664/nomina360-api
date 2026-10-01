import Decimal from 'decimal.js';
import { DEFAULT_PAYROLL_RULES } from '../rules/default-payroll-rules';
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
      baseSalary: DEFAULT_PAYROLL_RULES.minimumWage,
      accruedDays: 360,
      rules: DEFAULT_PAYROLL_RULES,
    });

    const expectedBase = DEFAULT_PAYROLL_RULES.minimumWage.plus(
      DEFAULT_PAYROLL_RULES.transportAllowance.monthlyAmount,
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
    const salaryLimit = DEFAULT_PAYROLL_RULES.minimumWage.times(
      DEFAULT_PAYROLL_RULES.transportAllowance.salaryLimitInMinimumWages,
    );

    const baseSalary = salaryLimit.plus(1);

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 360,
      rules: DEFAULT_PAYROLL_RULES,
    });

    expect(result.severanceBase.toString()).toBe(baseSalary.toString());
  });

  it('should calculate proportional severance payroll', () => {
    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      accruedDays: 180,
      rules: DEFAULT_PAYROLL_RULES,
    });

    expect(result.earnedTotal.gt(0)).toBe(true);
    expect(result.netPay.eq(result.earnedTotal)).toBe(true);
    expect(result.concepts).toHaveLength(2);
  });

  it('should propagate transport allowance rules into severance base', () => {
    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      minimumWage: new Decimal('5000000'),
      transportAllowance: {
        ...DEFAULT_PAYROLL_RULES.transportAllowance,
        monthlyAmount: new Decimal('600000'),
      },
    };

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      accruedDays: 360,
      rules,
    });

    expect(result.severanceBase.toString()).toBe('3600000');
  });

  it('should propagate the supplied severance rules', () => {
    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      severance: {
        daysPerYear: 180,
        interestAnnualRate: new Decimal('0.20'),
      },
    };

    const salaryLimit = rules.minimumWage.times(
      rules.transportAllowance.salaryLimitInMinimumWages,
    );

    const baseSalary = salaryLimit.plus(1);

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 90,
      rules,
    });

    expect(result.severanceBase.eq(baseSalary)).toBe(true);
    expect(result.earnedTotal.eq(baseSalary.times('0.55'))).toBe(true);
  });
});
