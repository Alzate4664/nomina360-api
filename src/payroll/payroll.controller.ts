import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  parseOptionalInteger,
  parsePositiveInteger,
} from '../common/utils/pagination.util';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { PayrollService } from './payroll.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calcular un período de nómina' })
  @ApiResponse({
    status: 201,
    description: 'Nómina calculada correctamente.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Los datos enviados son inválidos o el período no puede calcularse.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no enviado o no válido.',
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene permisos para calcular la nómina.',
  })
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  calculate(@CurrentUser() user: any, @Body() dto: CalculatePayrollDto) {
    return this.payrollService.calculatePayroll(
      user.companyId,
      user.sub,
      dto.year,
      dto.month,
      dto.payrollType,
    );
  }

  @Post('periods')
  @ApiOperation({ summary: 'Crear un período de nómina' })
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  createPayrollPeriod(
    @CurrentUser() user: any,
    @Body() dto: CreatePayrollPeriodDto,
  ) {
    return this.payrollService.createPayrollPeriod(user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar períodos de nómina' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'year', required: false, type: Number, example: 2026 })
  @ApiQuery({ name: 'month', required: false, type: Number, example: 8 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'DRAFT',
      'COLLECTING_NOVELTIES',
      'CALCULATING',
      'CALCULATED',
      'APPROVED',
      'CLOSED',
      'REOPENED',
    ],
  })
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.payrollService.findAll(
      user.companyId,
      parsePositiveInteger(page, 'page', 1),
      parsePositiveInteger(limit, 'limit', 20, 100),
      parseOptionalInteger(year, 'year', 2000, 2100),
      parseOptionalInteger(month, 'month', 1, 12),
      status,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un período de nómina' })
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.findOne(user.companyId, id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Aprobar un período de nómina calculado' })
  @ApiResponse({
    status: 200,
    description: 'Período de nómina aprobado correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Solo los períodos calculados pueden aprobarse.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no enviado o no válido.',
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene permisos para aprobar el período.',
  })
  @ApiResponse({
    status: 404,
    description: 'Período de nómina no encontrado.',
  })
  @Roles('OWNER', 'ADMIN')
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.approvePayroll(user.companyId, user.sub, id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Cerrar un período de nómina aprobado' })
  @ApiResponse({
    status: 200,
    description: 'Período de nómina cerrado correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Solo los períodos aprobados pueden cerrarse.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no enviado o no válido.',
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene permisos para cerrar el período.',
  })
  @ApiResponse({
    status: 404,
    description: 'Período de nómina no encontrado.',
  })
  @Roles('OWNER', 'ADMIN')
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.closePayroll(user.companyId, user.sub, id);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reabrir un período de nómina cerrado' })
  @ApiResponse({
    status: 200,
    description: 'Período de nómina reabierto correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'El período no se encuentra cerrado y no puede reabrirse.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no enviado o no válido.',
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene permisos para reabrir el período.',
  })
  @ApiResponse({
    status: 404,
    description: 'Período de nómina no encontrado.',
  })
  @Roles('OWNER', 'ADMIN')
  reopen(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.reopenPayroll(user.companyId, user.sub, id);
  }
}
