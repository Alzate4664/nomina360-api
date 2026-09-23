import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { SundayHolidayCalculator } from './sunday-holiday.calculator';

describe('SundayHolidayCalculator', () => {
  let calculator: SundayHolidayCalculator;

  beforeEach(() => {
    calculator = new SundayHolidayCalculator();
  });

  const createSurcharge = (
    type: 'SUNDAY_SURCHARGE' | 'HOLIDAY_SURCHARGE',
    hours: string,
    description: string,
  ): PayrollNovelty =>
    ({
      type,
      quantity: new Prisma.Decimal(hours),
      amount: null,
      description,
    }) as unknown as PayrollNovelty;

  it('should calculate sunday surcharge using the configured rate', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createSurcharge('SUNDAY_SURCHARGE', '2', '2 horas dominicales'),
    ]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('18000');

    expect(result.concepts).toEqual([
      {
        code: 'SUNDAY_SURCHARGE',
        name: '2 horas dominicales',
        type: ConceptType.EARNING,
        amount: new Decimal('18000'),
      },
    ]);
  });

  it('should calculate holiday surcharge using the configured rate', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createSurcharge('HOLIDAY_SURCHARGE', '2', '2 horas festivas'),
    ]);

    expect(result.earned.toString()).toBe('18000');
  });

  it('should preserve fractional sunday hours exactly', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createSurcharge(
        'SUNDAY_SURCHARGE',
        '1.5',
        'Horas dominicales fraccionarias',
      ),
    ]);

    expect(result.earned.toString()).toBe('13500');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });
});
