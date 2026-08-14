import { ConceptType, PayrollDayType, SickLeaveOrigin } from '@prisma/client';
import { SickLeaveCalculator } from './sick-leave.calculator';

describe('SickLeaveCalculator', () => {
  let calculator: SickLeaveCalculator;

  beforeEach(() => {
    calculator = new SickLeaveCalculator();
  });

  const createSickLeave = (
    origin: SickLeaveOrigin,
    startDay: number,
    days: number,
    sickLeaveIbc = 3000000,
    description = 'Incapacidad',
  ) => ({
    id: 'novelty-1',
    companyId: 'company-1',
    employeeId: 'employee-1',
    payrollPeriodId: 'period-1',
    type: 'SICK_LEAVE' as const,
    dayType: PayrollDayType.REGULAR,
    sickLeaveOrigin: origin,
    sickLeaveStartDay: startDay,
    sickLeaveIbc,
    quantity: days,
    amount: null,
    description,
    createdAt: new Date(),
  });

  it('should calculate common disease starting on day 1', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, 2),
    ]);

    expect(result.earned).toBeCloseTo(133333.3333333333);

    expect(result.concepts).toHaveLength(1);

    expect(result.concepts[0]).toMatchObject({
      code: 'SICK_LEAVE',
      name: 'Incapacidad',
      type: ConceptType.EARNING,
    });

    expect(result.concepts[0].amount).toBeCloseTo(133333.3333333333);
  });

  it('should calculate common disease between days 3 and 90', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 3, 3),
    ]);

    expect(result.earned).toBeCloseTo(200000);

    expect(result.concepts).toHaveLength(1);

    expect(result.concepts[0]).toMatchObject({
      code: 'SICK_LEAVE',
      name: 'Incapacidad',
      type: ConceptType.EARNING,
    });

    expect(result.concepts[0].amount).toBeCloseTo(200000);
  });

  it('should calculate common disease starting from day 91', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 91, 3),
    ]);

    expect(result.earned).toBe(150000);

    expect(result.concepts).toEqual([
      {
        code: 'SICK_LEAVE',
        name: 'Incapacidad',
        type: ConceptType.EARNING,
        amount: 150000,
      },
    ]);
  });

  it('should calculate common disease crossing payment ranges', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 89, 4),
    ]);

    expect(result.earned).toBeCloseTo(233333.3333333333);

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].type).toBe(ConceptType.EARNING);
    expect(result.concepts[0].amount).toBeCloseTo(233333.3333333333);
  });

  it('should calculate work accident sick leave', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.WORK_ACCIDENT, 1, 3),
    ]);

    expect(result.earned).toBe(300000);

    expect(result.concepts).toEqual([
      {
        code: 'SICK_LEAVE',
        name: 'Incapacidad',
        type: ConceptType.EARNING,
        amount: 300000,
      },
    ]);
  });

  it('should calculate occupational disease sick leave', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.OCCUPATIONAL_DISEASE, 1, 3),
    ]);

    expect(result.earned).toBe(300000);

    expect(result.concepts).toEqual([
      {
        code: 'SICK_LEAVE',
        name: 'Incapacidad',
        type: ConceptType.EARNING,
        amount: 300000,
      },
    ]);
  });

  it('should use sick leave IBC instead of employee base salary', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.WORK_ACCIDENT, 1, 3, 4500000),
    ]);

    expect(result.earned).toBe(450000);

    expect(result.concepts).toEqual([
      {
        code: 'SICK_LEAVE',
        name: 'Incapacidad',
        type: ConceptType.EARNING,
        amount: 450000,
      },
    ]);
  });

  it('should ignore sick leave with zero days', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, 0),
    ]);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should ignore sick leave with negative days', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, -2),
    ]);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should ignore sick leave with invalid IBC', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, 2, 0),
    ]);

    expect(result.earned).toBe(0);
    expect(result.concepts).toEqual([]);
  });

  it('should return the total number of valid sick leave days', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, 2),
      {
        ...createSickLeave(SickLeaveOrigin.WORK_ACCIDENT, 1, 3),
        id: 'novelty-2',
      },
    ]);

    expect(result.days).toBe(5);
  });
});
