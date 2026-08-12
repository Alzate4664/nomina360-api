import { ConceptType } from '@prisma/client';
import { PAYROLL_RATES } from '../config/payroll-rates.config';
import { TransportAllowanceCalculator } from './transport-allowance.calculator';

describe('TransportAllowanceCalculator', () => {
  let calculator: TransportAllowanceCalculator;

  beforeEach(() => {
    calculator = new TransportAllowanceCalculator();
  });

  it('should calculate the full monthly transport allowance for an eligible employee', () => {
    const result = calculator.calculate(PAYROLL_RATES.minimumWage, 30);

    expect(result.earned).toBe(PAYROLL_RATES.transportAllowance.monthlyAmount);

    expect(result.concepts).toEqual([
      {
        code: 'TRANSPORT_ALLOWANCE',
        name: 'Auxilio de transporte',
        type: ConceptType.EARNING,
        amount: PAYROLL_RATES.transportAllowance.monthlyAmount,
      },
    ]);
  });

  it('should prorate the transport allowance by worked days', () => {
    const result = calculator.calculate(PAYROLL_RATES.minimumWage, 15);

    expect(result.earned).toBe(
      Math.round((PAYROLL_RATES.transportAllowance.monthlyAmount / 30) * 15),
    );
  });

  it('should not pay transport allowance above the salary limit', () => {
    const salaryLimit =
      PAYROLL_RATES.minimumWage *
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages;

    const result = calculator.calculate(salaryLimit + 1, 30);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should allow transport allowance exactly at the salary limit', () => {
    const salaryLimit =
      PAYROLL_RATES.minimumWage *
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages;

    const result = calculator.calculate(salaryLimit, 30);

    expect(result.earned).toBe(PAYROLL_RATES.transportAllowance.monthlyAmount);
  });

  it('should not pay transport allowance when worked days are zero', () => {
    const result = calculator.calculate(PAYROLL_RATES.minimumWage, 0);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should cap worked days at 30', () => {
    const result = calculator.calculate(PAYROLL_RATES.minimumWage, 31);

    expect(result.earned).toBe(PAYROLL_RATES.transportAllowance.monthlyAmount);
  });
});
