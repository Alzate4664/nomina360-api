import Decimal from 'decimal.js';
import { PAYROLL_RATES } from './config/payroll-rates.config';
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
      baseSalary: new Decimal(PAYROLL_RATES.minimumWage),
      accruedDays: 180,
    });

    expect(Decimal.isDecimal(result.earnedTotal)).toBe(true);
    expect(Decimal.isDecimal(result.deductionsTotal)).toBe(true);
    expect(Decimal.isDecimal(result.netPay)).toBe(true);

    expect(result.earnedTotal.toString()).toBe('1000000');
    expect(result.deductionsTotal.toString()).toBe('0');
    expect(result.netPay.toString()).toBe('1000000');
  });

  it('should exclude transport allowance above salary limit', () => {
    const salaryLimit = new Decimal(PAYROLL_RATES.minimumWage).times(
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages,
    );

    const baseSalary = salaryLimit.plus(1);

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 180,
    });

    expect(result.earnedTotal.eq(baseSalary.dividedBy(2))).toBe(true);
  });

  it('should calculate proportional service bonus payroll exactly', () => {
    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      accruedDays: 90,
    });

    expect(result.earnedTotal.toString()).toBe('812273.75');
    expect(result.netPay.eq(result.earnedTotal)).toBe(true);
    expect(result.concepts).toHaveLength(1);
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });
});