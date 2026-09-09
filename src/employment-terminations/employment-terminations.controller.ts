import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { parsePositiveInteger } from '../common/utils/pagination.util';
import { CreateEmploymentTerminationDto } from './dto/create-employment-termination.dto';
import { EmploymentTerminationsService } from './employment-terminations.service';

@ApiTags('Employment Terminations')
@ApiBearerAuth()
@Controller('employment-terminations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmploymentTerminationsController {
  constructor(
    private readonly employmentTerminationsService: EmploymentTerminationsService,
  ) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmploymentTerminationDto,
  ) {
    return this.employmentTerminationsService.create(
      user.companyId,
      user.sub,
      dto,
    );
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.employmentTerminationsService.findAll(
      user.companyId,
      parsePositiveInteger(page, 'page', 1),
      parsePositiveInteger(limit, 'limit', 20, 100),
    );
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employmentTerminationsService.findOne(user.companyId, id);
  }
}
