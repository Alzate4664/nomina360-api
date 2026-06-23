import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { parsePositiveInteger } from '../common/utils/pagination.util';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

@Post()
@Roles('OWNER', 'ADMIN')
create(@CurrentUser() user: any, @Body() dto: CreateUserDto) {
  return this.usersService.create(user.companyId, user.sub, dto);
  }

@Get()
@Roles('OWNER', 'ADMIN')
findAll(
  @CurrentUser() user: any,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
  @Query('search') search?: string,
 ) {
  return this.usersService.findAll(
    user.companyId,
    parsePositiveInteger(page, 'page', 1),
    parsePositiveInteger(limit, 'limit', 20, 100),
    search,
  );
 }

  @Get(':id')
  @Roles('OWNER', 'ADMIN')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findOne(user.companyId, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user.companyId, id, user.sub, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.remove(user.companyId, id, user.sub);
  }
}