# ===================================================================
# NOMINA360
# Sprint : 3.1.1
# Objetivo: Crear ClosePayrollPeriodUseCase
# ===================================================================

$ErrorActionPreference = "Stop"

$useCasePath = ".\src\payroll\use-cases\close-payroll-period.use-case.ts"

New-Item `
    -ItemType Directory `
    -Force `
    -Path (Split-Path $useCasePath) | Out-Null

@'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollPeriodResponseDto } from '../dto/payroll-period-response.dto';

@Injectable()
export class ClosePayrollPeriodUseCase {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    companyId: string,
    currentUserId: string,
    id: string,
  ): Promise<PayrollPeriodResponseDto> {

    // La lógica se implementará en el siguiente script.

    throw new Error('Pendiente de implementación');
  }
}
'@ | Set-Content $useCasePath -Encoding UTF8

Write-Host ""
Write-Host "Use Case creado correctamente." -ForegroundColor Green