import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { NightSurchargeCalculator } from './night-surcharge.calculator';

describe('NightSurchargeCalculator', () => {
  let calculator: NightSurchargeCalculator;

  beforeEach(() => {
    calculator = new NightSurchargeCalculator();
  });

  const createNightSurcharge = (
    hours: string,
    description = 'Recargo nocturno',
  ): PayrollNovelty =>
    ({
      type: 'NIGHT_SURCHARGE',
      quantity: new Prisma.Decimal(hours),
      amount: null,
      description,
    }) as unknown as PayrollNovelty;

  it('should calculate nighttime surcharge using the configured rate', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createNightSurcharge('2', '2 horas recargo nocturno'),
    ]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('7000');

    expect(result.concepts).toEqual([
      {
        code: 'NIGHT_SURCHARGE',
        name: '2 horas recargo nocturno',
        type: ConceptType.EARNING,
        amount: new Decimal('7000'),
      },
    ]);
  });

  it('should preserve fractional nighttime hours exactly', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createNightSurcharge('1.5'),
    ]);

    expect(result.earned.toString()).toBe('5250');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });
});