import { AccruedDaysCalculator } from './accrued-days.calculator';
import { BaseSalaryCalculator } from './concepts/base-salary.calculator';
import { SeveranceCalculator } from './concepts/severance.calculator';
import { ServiceBonusCalculator } from './concepts/service-bonus.calculator';
import { TerminationVacationCalculator } from './concepts/termination-vacation.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';
import { ServiceBonusPayrollCalculator } from './service-bonus-payroll.calculator';
import { SeverancePayrollCalculator } from './severance-payroll.calculator';
import { TerminationPayrollCalculator } from './termination-payroll.calculator';

describe('TerminationPayrollCalculator', () => {
  let calculator: TerminationPayrollCalculator;

  beforeEach(() => {
    const accruedDaysCalculator = new AccruedDaysCalculator();
    const baseSalaryCalculator = new BaseSalaryCalculator();
    const transportAllowanceCalculator = new TransportAllowanceCalculator();

    const severanceCalculator = new SeveranceCalculator();

    const severancePayrollCalculator = new SeverancePayrollCalculator(
      severanceCalculator,
      transportAllowanceCalculator,
    );

    const serviceBonusCalculator = new ServiceBonusCalculator();

    const serviceBonusPayrollCalculator = new ServiceBonusPayrollCalculator(
      serviceBonusCalculator,
      transportAllowanceCalculator,
    );

    const terminationVacationCalculator = new TerminationVacationCalculator();

    calculator = new TerminationPayrollCalculator(
      baseSalaryCalculator,
      accruedDaysCalculator,
      severancePayrollCalculator,
      serviceBonusPayrollCalculator,
      terminationVacationCalculator,
    );
  });

  it('should calculate pending salary through the exact termination date', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      employeeStartDate: new Date('2025-01-01T00:00:00.000Z'),
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      unpaidSalaryStartDate: new Date('2026-09-01T00:00:00.000Z'),
      pendingVacationDays: 0,
    });

    expect(result.salaryDays).toBe(8);
    expect(result.salary).toBe(800000);
  });

  it('should calculate severance only for the current year', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      employeeStartDate: new Date('2024-01-01T00:00:00.000Z'),
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      unpaidSalaryStartDate: new Date('2026-09-01T00:00:00.000Z'),
      pendingVacationDays: 0,
    });

    expect(result.severanceDays).toBe(248);
    expect(result.severance).toBeGreaterThan(0);
  });

  it('should calculate service bonus from the current semester', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      employeeStartDate: new Date('2024-01-01T00:00:00.000Z'),
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      unpaidSalaryStartDate: new Date('2026-09-01T00:00:00.000Z'),
      pendingVacationDays: 0,
    });

    expect(result.serviceBonusDays).toBe(68);
    expect(result.serviceBonus).toBeGreaterThan(0);
  });

  it('should use employee start date when hired during the semester', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      employeeStartDate: new Date('2026-07-15T00:00:00.000Z'),
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      unpaidSalaryStartDate: new Date('2026-09-01T00:00:00.000Z'),
      pendingVacationDays: 0,
    });

    expect(result.serviceBonusDays).toBe(54);
  });

  it('should include pending vacation compensation in total earnings', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      employeeStartDate: new Date('2025-01-01T00:00:00.000Z'),
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      unpaidSalaryStartDate: new Date('2026-09-01T00:00:00.000Z'),
      pendingVacationDays: 7.5,
    });

    expect(result.vacation).toBe(750000);

    expect(result.earnedTotal).toBe(
      result.salary + result.severance + result.serviceBonus + result.vacation,
    );
  });

  it('should expose all generated concepts', () => {
    const result = calculator.calculate({
      baseSalary: 3000000,
      employeeStartDate: new Date('2025-01-01T00:00:00.000Z'),
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      unpaidSalaryStartDate: new Date('2026-09-01T00:00:00.000Z'),
      pendingVacationDays: 7.5,
    });

    const codes = result.concepts.map((concept) => concept.code);

    expect(codes).toContain('BASE_SALARY');
    expect(codes).toContain('SEVERANCE');
    expect(codes).toContain('SEVERANCE_INTEREST');
    expect(codes).toContain('SERVICE_BONUS');
    expect(codes).toContain('TERMINATION_VACATION');
  });
});
