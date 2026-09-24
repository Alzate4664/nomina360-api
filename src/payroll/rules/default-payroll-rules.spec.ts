import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';

describe('DEFAULT_PAYROLL_RULES', () => {
  it('should preserve the current payroll rule values', () => {
    expect(DEFAULT_PAYROLL_RULES.minimumWage.toString()).toBe('1750905');
    expect(DEFAULT_PAYROLL_RULES.salary.daysPerMonth).toBe(30);
    expect(DEFAULT_PAYROLL_RULES.standardMonthlyHours.toString()).toBe('210');

    expect(DEFAULT_PAYROLL_RULES.overtime.daytimeMultiplier.toString()).toBe(
      '1.25',
    );
    expect(DEFAULT_PAYROLL_RULES.overtime.nighttimeMultiplier.toString()).toBe(
      '1.75',
    );

    expect(DEFAULT_PAYROLL_RULES.surcharges.nighttimeRate.toString()).toBe(
      '0.35',
    );
    expect(DEFAULT_PAYROLL_RULES.surcharges.sundayHolidayRate.toString()).toBe(
      '0.9',
    );

    expect(
      DEFAULT_PAYROLL_RULES.contributions.employeeHealthRate.toString(),
    ).toBe('0.04');
    expect(
      DEFAULT_PAYROLL_RULES.contributions.employeePensionRate.toString(),
    ).toBe('0.04');

    expect(
      DEFAULT_PAYROLL_RULES.transportAllowance.monthlyAmount.toString(),
    ).toBe('249095');
    expect(
      DEFAULT_PAYROLL_RULES.transportAllowance.salaryLimitInMinimumWages.toString(),
    ).toBe('2');

    expect(DEFAULT_PAYROLL_RULES.severance.daysPerYear).toBe(360);
    expect(DEFAULT_PAYROLL_RULES.severance.interestAnnualRate.toString()).toBe(
      '0.12',
    );

    expect(DEFAULT_PAYROLL_RULES.serviceBonus.daysPerYear).toBe(360);

    expect(DEFAULT_PAYROLL_RULES.sickLeave.commonDiseaseFirstRangeEndDay).toBe(
      90,
    );
    expect(
      DEFAULT_PAYROLL_RULES.sickLeave.commonDiseaseFirstRate
        .times(3)
        .toString(),
    ).toBe('2');

    expect(DEFAULT_PAYROLL_RULES.sickLeave.commonDiseaseSecondRangeEndDay).toBe(
      180,
    );
    expect(
      DEFAULT_PAYROLL_RULES.sickLeave.commonDiseaseSecondRate.toString(),
    ).toBe('0.5');
    expect(DEFAULT_PAYROLL_RULES.sickLeave.workRiskRate.toString()).toBe('1');
  });
});
