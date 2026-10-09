import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`La variable de entorno ${name} es obligatoria.`);
  }

  return value;
}

async function seedProductionDatabase() {
  const prisma = new PrismaService();

  try {
    const companyName = requiredEnv('SEED_COMPANY_NAME');
    const companyNit = requiredEnv('SEED_COMPANY_NIT');
    const companyEmail = requiredEnv('SEED_COMPANY_EMAIL').toLowerCase();

    const adminName = requiredEnv('SEED_ADMIN_NAME');
    const adminEmail = requiredEnv('SEED_ADMIN_EMAIL').toLowerCase();

    const adminPassword = requiredEnv('SEED_ADMIN_PASSWORD');

    const companyPhone = process.env.SEED_COMPANY_PHONE?.trim() || null;

    const companyAddress = process.env.SEED_COMPANY_ADDRESS?.trim() || null;

    if (adminPassword.length < 12) {
      throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
    }

    await prisma.$connect();

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const { company, owner } = await prisma.$transaction(async (tx) => {
      const existingCompany = await tx.company.findUnique({
        where: {
          nit: companyNit,
        },
        select: {
          id: true,
        },
      });

      const existingAdmin = await tx.user.findUnique({
        where: {
          email: adminEmail,
        },
        select: {
          id: true,
          companyId: true,
          role: true,
        },
      });

      if (
        existingAdmin &&
        (!existingCompany ||
          existingAdmin.companyId !== existingCompany.id ||
          existingAdmin.role !== 'OWNER')
      ) {
        throw new Error(
          'SEED_ADMIN_EMAIL ya pertenece a un usuario con otro ámbito, empresa o rol. El seed no modificará su identidad.',
        );
      }

      const company = await tx.company.upsert({
        where: {
          nit: companyNit,
        },
        update: {
          name: companyName,
          email: companyEmail,
          phone: companyPhone,
          address: companyAddress,
          status: 'ACTIVE',
        },
        create: {
          name: companyName,
          nit: companyNit,
          email: companyEmail,
          phone: companyPhone,
          address: companyAddress,
          status: 'ACTIVE',
        },
      });

      const owner = existingAdmin
        ? await tx.user.update({
            where: {
              id: existingAdmin.id,
            },
            data: {
              name: adminName,
              passwordHash,
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              companyId: company.id,
              name: adminName,
              email: adminEmail,
              passwordHash,
              role: 'OWNER',
              isActive: true,
            },
          });

      return {
        company,
        owner,
      };
    });

    console.log('Producción inicializada correctamente.');
    console.log(`Empresa: ${company.name}`);
    console.log(`Administrador: ${owner.email}`);
  } catch (error) {
    console.error('Error inicializando producción:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void seedProductionDatabase();
