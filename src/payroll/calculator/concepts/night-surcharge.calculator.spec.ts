import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { NightSurchargeCalculator } from './night-surcharge.calculator';

const defaultRules = {
  standardMonthlyHours: new Decimal('210'),
  nighttimeRate: new Decimal('0.35'),
};

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
    const result = calculator.calculate(
      new Decimal('2100000'),
      [createNightSurcharge('2', '2 horas recargo nocturno')],
      defaultRules,
    );

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
    const result = calculator.calculate(
      new Decimal('2100000'),
      [createNightSurcharge('1.5')],
      defaultRules,
    );

    expect(result.earned.toString()).toBe('5250');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });

  it('should use the supplied nighttime surcharge rate', () => {
    const result = calculator.calculate(
      new Decimal('2100000'),
      [createNightSurcharge('2')],
      {
        ...defaultRules,
        nighttimeRate: new Decimal('0.5'),
      },
    );

    expect(result.earned.toString()).toBe('10000');
  });

  it('should use the supplied standard monthly hours', () => {
    const result = calculator.calculate(
      new Decimal('2100000'),
      [createNightSurcharge('2')],
      {
        ...defaultRules,
        standardMonthlyHours: new Decimal('200'),
      },
    );

    expect(result.earned.toString()).toBe('7350');
  });
});
