import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(companyId: string, currentUserId: string, dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (existingUser) {
      throw new BadRequestException('Ya existe un usuario con este correo');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const createdUser = await this.prisma.user.create({
      data: {
        companyId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: createdUser.id,
      newValue: createdUser,
    });

    return createdUser;
  }

  async findAll(
  companyId: string,
  page = 1,
  limit = 20,
  search?: string,
 ) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const where = {
    companyId,
    ...(search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };

  const [data, total] = await this.prisma.$transaction([
    this.prisma.user.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    this.prisma.user.count({
      where,
    }),
  ]);

  return {
    data,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit),
  };
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        companyId,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async update(
    companyId: string,
    id: string,
    currentUserId: string,
    dto: UpdateUserDto,
  ) {
    const user = await this.findOne(companyId, id);

    if (id === currentUserId && dto.isActive === false) {
  throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    if (id === currentUserId && dto.role && dto.role !== user.role) {
  throw new BadRequestException('No puedes cambiar tu propio rol');
    }

    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (existingUser) {
        throw new BadRequestException('Ya existe un usuario con este correo');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        isActive: dto.isActive,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: updatedUser.id,
      oldValue: user,
      newValue: updatedUser,
    });

    return updatedUser;
  }

  async remove(companyId: string, id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    const user = await this.findOne(companyId, id);

    const deactivatedUser = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        isActive: false,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'DEACTIVATE_USER',
      entity: 'User',
      entityId: deactivatedUser.id,
      oldValue: user,
      newValue: deactivatedUser,
    });

    return deactivatedUser;
  }
}