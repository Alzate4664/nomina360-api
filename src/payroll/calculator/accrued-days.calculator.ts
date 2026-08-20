import { Injectable } from '@nestjs/common';

@Injectable()
export class AccruedDaysCalculator {
  calculate(startDate: Date, year: number, month: number): number {
    const periodStart = new Date(Date.UTC(year, 0, 1));

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

    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    return (
      Math.floor(
        (periodEnd.getTime() - accrualStart.getTime()) / millisecondsPerDay,
      ) + 1
    );
  }
}
