import Decimal from 'decimal.js';
import {
  PayrollCalculationResult,
  PayrollConceptAmount,
} from './payroll-money.types';

describe('payroll money contracts', () => {
  it('should represent concept amounts with Decimal', () => {
    const concept: PayrollConceptAmount = {
      code: 'BASE_SALARY',
      name: 'Salario ordinario',
      type: 'EARNING',
      amount: new Decimal('23345.4'),
    };

    expect(concept.amount.toString()).toBe('23345.4');
  });

  it('should represent payroll totals with Decimal', () => {
    const result: PayrollCalculationResult = {
      earnedTotal: new Decimal('1000.10'),
      deductionsTotal: new Decimal('200.05'),
      netPay: new Decimal('800.05'),
      concepts: [],
    };

    expect(result.earnedTotal.minus(result.deductionsTotal).toString()).toBe(
      result.netPay.toString(),
    );
  });
});
