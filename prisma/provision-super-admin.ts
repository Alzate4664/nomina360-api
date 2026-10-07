import { isEmail } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';

const SUPER_ADMIN_BOOTSTRAP_LOCK_NAMESPACE = 560360;
const SUPER_ADMIN_BOOTSTRAP_LOCK_KEY = 1;
const SUPER_ADMIN_BOOTSTRAP_CONFIRMATION = 'CREATE_FIRST_SUPER_ADMIN';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`La variable de entorno ${name} es obligatoria.`);
  }

  return value;
}

async function provisionSuperAdmin() {
  const prisma = new PrismaService();

  try {
    const confirmation = requiredEnv('PLATFORM_ADMIN_BOOTSTRAP_CONFIRM');

    if (confirmation !== SUPER_ADMIN_BOOTSTRAP_CONFIRMATION) {
      throw new Error(
        `PLATFORM_ADMIN_BOOTSTRAP_CONFIRM debe ser exactamente ${SUPER_ADMIN_BOOTSTRAP_CONFIRMATION}.`,
      );
    }

    const name = requiredEnv('PLATFORM_ADMIN_NAME');
    const email = requiredEnv('PLATFORM_ADMIN_EMAIL').toLowerCase();
    const password = requiredEnv('PLATFORM_ADMIN_PASSWORD');

    if (!isEmail(email)) {
      throw new Error(
        'PLATFORM_ADMIN_EMAIL debe ser un correo electrónico válido.',
      );
    }

    if (password.length < 16) {
      throw new Error(
        'PLATFORM_ADMIN_PASSWORD debe tener al menos 16 caracteres.',
      );
    }

    await prisma.$connect();

    const passwordHash = await bcrypt.hash(password, 12);

    const superAdmin = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ${SUPER_ADMIN_BOOTSTRAP_LOCK_NAMESPACE},
          ${SUPER_ADMIN_BOOTSTRAP_LOCK_KEY}
        )
      `;

      const existingSuperAdminCount = await tx.user.count({
        where: {
          role: 'SUPER_ADMIN',
        },
      });

      if (existingSuperAdminCount > 0) {
        throw new Error(
          'Ya existe un SUPER_ADMIN. El bootstrap inicial no puede crear administradores de plataforma adicionales.',
        );
      }

      const existingUser = await tx.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        throw new Error(
          'PLATFORM_ADMIN_EMAIL ya pertenece a un usuario existente. El provisioning no modificará identidades existentes.',
        );
      }

      const createdSuperAdmin = await tx.user.create({
        data: {
          companyId: null,
          name,
          email,
          passwordHash,
          role: 'SUPER_ADMIN',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: null,
          userId: null,
          action: 'PROVISION_SUPER_ADMIN',
          entity: 'User',
          entityId: createdSuperAdmin.id,
          newValue: {
            name: createdSuperAdmin.name,
            email: createdSuperAdmin.email,
            role: createdSuperAdmin.role,
            scope: 'PLATFORM',
            isActive: createdSuperAdmin.isActive,
          },
        },
      });

      return createdSuperAdmin;
    });

    console.log('SUPER_ADMIN inicial provisionado correctamente.');
    console.log(`Usuario: ${superAdmin.email}`);
  } catch (error) {
    console.error('Error provisionando SUPER_ADMIN:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void provisionSuperAdmin();
