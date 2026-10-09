import Decimal from 'decimal.js';
import { DEFAULT_PAYROLL_RULES } from '../rules/default-payroll-rules';
import { ServiceBonusCalculator } from './concepts/service-bonus.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';
import { ServiceBonusPayrollCalculator } from './service-bonus-payroll.calculator';

describe('ServiceBonusPayrollCalculator', () => {
  let calculator: ServiceBonusPayrollCalculator;

  beforeEach(() => {
    calculator = new ServiceBonusPayrollCalculator(
      new ServiceBonusCalculator(),
      new TransportAllowanceCalculator(),
    );
  });

  it('should include transport allowance in service bonus base for eligible employee', () => {
    const result = calculator.calculate({
      baseSalary: DEFAULT_PAYROLL_RULES.minimumWage,
      accruedDays: 180,
      rules: DEFAULT_PAYROLL_RULES,
    });

    expect(Decimal.isDecimal(result.earnedTotal)).toBe(true);
    expect(Decimal.isDecimal(result.deductionsTotal)).toBe(true);
    expect(Decimal.isDecimal(result.netPay)).toBe(true);

    expect(result.earnedTotal.toString()).toBe('1000000');
    expect(result.deductionsTotal.toString()).toBe('0');
    expect(result.netPay.toString()).toBe('1000000');
  });

  it('should exclude transport allowance above salary limit', () => {
    const salaryLimit = DEFAULT_PAYROLL_RULES.minimumWage.times(
      DEFAULT_PAYROLL_RULES.transportAllowance.salaryLimitInMinimumWages,
    );

    const baseSalary = salaryLimit.plus(1);

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 180,
      rules: DEFAULT_PAYROLL_RULES,
    });

    expect(result.earnedTotal.eq(baseSalary.dividedBy(2))).toBe(true);
  });

  it('should calculate proportional service bonus payroll exactly', () => {
    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      accruedDays: 90,
      rules: DEFAULT_PAYROLL_RULES,
    });

    expect(result.earnedTotal.toString()).toBe('812273.75');
    expect(result.netPay.eq(result.earnedTotal)).toBe(true);
    expect(result.concepts).toHaveLength(1);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });

  it('should propagate transport allowance rules into service bonus base', () => {
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
      accruedDays: 180,
      rules,
    });

    expect(result.earnedTotal.toString()).toBe('1800000');
  });

  it('should propagate the supplied service bonus days per year', () => {
    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      serviceBonus: {
        ...DEFAULT_PAYROLL_RULES.serviceBonus,
        daysPerYear: 180,
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

    expect(result.earnedTotal.eq(baseSalary.dividedBy(2))).toBe(true);
  });
});
