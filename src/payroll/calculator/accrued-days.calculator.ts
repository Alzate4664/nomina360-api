import { Injectable } from '@nestjs/common';

@Injectable()
export class AccruedDaysCalculator {
  calculate(
    startDate: Date,
    year: number,
    month: number,
    startMonth = 1,
  ): number {
    const periodStart = new Date(Date.UTC(year, startMonth - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0));

    const employeeStart = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
      ),
    );

    if (employeeStart > periodEnd) {
      return 0;
    }

    const accrualStart =
      employeeStart > periodStart ? employeeStart : periodStart;

    return this.calculate360Days(accrualStart, periodEnd);
  }

  private calculate360Days(startDate: Date, endDate: Date): number {
    const startYear = startDate.getUTCFullYear();
    const startMonth = startDate.getUTCMonth() + 1;
    const startDay = Math.min(startDate.getUTCDate(), 30);

    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth() + 1;

    // Los períodos de nómina terminan al cierre del mes,
    // que en la convención laboral 30/360 equivale al día 30.
    const endDay = 30;

    return (
      (endYear - startYear) * 360 +
      (endMonth - startMonth) * 30 +
      (endDay - startDay) +
      1
    );
  }
}
