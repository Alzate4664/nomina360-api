import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findMe(@CurrentUser() user: any) {
    return this.companiesService.findMe(user.companyId);
  }

  @Patch('me')
@Roles('OWNER', 'ADMIN')
updateMe(@CurrentUser() user: any, @Body() dto: UpdateCompanyDto) {
  return this.companiesService.updateMe(user.companyId, user.sub, dto);
 }
}