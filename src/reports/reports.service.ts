import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateMonthlyPayrollReport(
    companyId: string,
    year: number,
    month: number,
  ) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
        year,
        month,
      },
      include: {
        items: {
          include: {
            employee: true,
            concepts: true,
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundException('No existe nómina para este periodo');
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Nómina mensual');

    sheet.columns = [
      { header: 'Empleado', key: 'employee', width: 30 },
      { header: 'Documento', key: 'document', width: 20 },
      { header: 'Cargo', key: 'position', width: 30 },
      { header: 'Salario base', key: 'baseSalary', width: 18 },
      { header: 'Devengado', key: 'earnedTotal', width: 18 },
      { header: 'Deducciones', key: 'deductionsTotal', width: 18 },
      { header: 'Neto a pagar', key: 'netPay', width: 18 },
      { header: 'Estado', key: 'status', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const item of period.items) {
      sheet.addRow({
        employee: `${item.employee.firstName} ${item.employee.lastName}`,
        document: item.employee.documentNumber,
        position: item.employee.position,
        baseSalary: Number(item.baseSalary),
        earnedTotal: Number(item.earnedTotal),
        deductionsTotal: Number(item.deductionsTotal),
        netPay: Number(item.netPay),
        status: period.status,
      });
    }

    const conceptsSheet = workbook.addWorksheet('Conceptos');

    conceptsSheet.columns = [
      { header: 'Empleado', key: 'employee', width: 30 },
      { header: 'Concepto', key: 'conceptName', width: 35 },
      { header: 'Código', key: 'conceptCode', width: 20 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Valor', key: 'amount', width: 18 },
    ];

    conceptsSheet.getRow(1).font = { bold: true };

    for (const item of period.items) {
      for (const concept of item.concepts) {
        conceptsSheet.addRow({
          employee: `${item.employee.firstName} ${item.employee.lastName}`,
          conceptName: concept.conceptName,
          conceptCode: concept.conceptCode,
          type: concept.type,
          amount: Number(concept.amount),
        });
      }
    }

    return workbook.xlsx.writeBuffer();
  }
}