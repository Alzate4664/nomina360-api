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
      baseSalary: PAYROLL_RATES.minimumWage,
      accruedDays: 180,
    });

    expect(result.earnedTotal).toBe(1000000);
    expect(result.deductionsTotal).toBe(0);
    expect(result.netPay).toBe(result.earnedTotal);
  });

  it('should exclude transport allowance above salary limit', () => {
    const salaryLimit =
      PAYROLL_RATES.minimumWage *
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages;

    const baseSalary = salaryLimit + 1;

    const result = calculator.calculate({
      baseSalary,
      accruedDays: 180,
    });

    expect(result.earnedTotal).toBe(baseSalary / 2);
  });

  it('should calculate proportional service bonus payroll', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      accruedDays: 90,
    });

    expect(result.earnedTotal).toBeGreaterThan(0);
    expect(result.netPay).toBe(result.earnedTotal);
    expect(result.concepts).toHaveLength(1);
  });
});
