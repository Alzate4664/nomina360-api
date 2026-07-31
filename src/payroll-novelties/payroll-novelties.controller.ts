import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePayrollNoveltyDto } from './dto/create-payroll-novelty.dto';
import { PayrollNoveltiesService } from './payroll-novelties.service';
import {
  parseOptionalInteger,
  parsePositiveInteger,
} from '../common/utils/pagination.util';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Payroll Novelties')
@ApiBearerAuth()
@Controller('payroll-novelties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollNoveltiesController {
  constructor(
    private readonly payrollNoveltiesService: PayrollNoveltiesService,
  ) {}

  @ApiOperation({ summary: 'Registrar una novedad de nómina' })
  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  create(@CurrentUser() user: any, @Body() dto: CreatePayrollNoveltyDto) {
    return this.payrollNoveltiesService.create(user.companyId, user.sub, dto);
  }

  @ApiOperation({ summary: 'Listar novedades de nómina' })
  @ApiQuery({ name: 'year', required: false, type: Number, example: 2026 })
  @ApiQuery({ name: 'month', required: false, type: Number, example: 8 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiOperation({ summary: 'Consultar una novedad de nómina' })
  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findAll(
    @CurrentUser() user: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.payrollNoveltiesService.findAll(
      user.companyId,
      parseOptionalInteger(year, 'year', 2000, 2100),
      parseOptionalInteger(month, 'month', 1, 12),
      parsePositiveInteger(page, 'page', 1),
      parsePositiveInteger(limit, 'limit', 20, 100),
      search,
    );
  }

  @ApiOperation({ summary: 'Eliminar una novedad de nómina' })
  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollNoveltiesService.findOne(user.companyId, id);
  }

  @ApiOperation({ summary: 'Eliminar una novedad de nómina' })
  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollNoveltiesService.remove(user.companyId, id, user.sub);
  }
}
