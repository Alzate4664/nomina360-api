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

    const employeeStart = this.normalizeDate(startDate);

    if (employeeStart > periodEnd) {
      return 0;
    }

    const accrualStart =
      employeeStart > periodStart ? employeeStart : periodStart;

    return this.calculate360Days(accrualStart, periodEnd, true);
  }

  calculateUntilDate(
    startDate: Date,
    endDate: Date,
    periodStartDate?: Date,
  ): number {
    const employeeStart = this.normalizeDate(startDate);
    const accrualEnd = this.normalizeDate(endDate);

    if (employeeStart > accrualEnd) {
      return 0;
    }

    const requestedPeriodStart = periodStartDate
      ? this.normalizeDate(periodStartDate)
      : employeeStart;

    const accrualStart =
      employeeStart > requestedPeriodStart
        ? employeeStart
        : requestedPeriodStart;

    if (accrualStart > accrualEnd) {
      return 0;
    }

    return this.calculate360Days(accrualStart, accrualEnd, false);
  }

  private normalizeDate(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private calculate360Days(
    startDate: Date,
    endDate: Date,
    forceMonthEnd: boolean,
  ): number {
    const startYear = startDate.getUTCFullYear();
    const startMonth = startDate.getUTCMonth() + 1;
    const startDay = Math.min(startDate.getUTCDate(), 30);

    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth() + 1;
    const endDay = forceMonthEnd ? 30 : Math.min(endDate.getUTCDate(), 30);

    return (
      (endYear - startYear) * 360 +
      (endMonth - startMonth) * 30 +
      (endDay - startDay) +
      1
    );
  }
}
