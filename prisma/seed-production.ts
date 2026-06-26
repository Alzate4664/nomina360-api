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
    const companyEmail = requiredEnv(
      'SEED_COMPANY_EMAIL',
    ).toLowerCase();

    const adminName = requiredEnv('SEED_ADMIN_NAME');
    const adminEmail = requiredEnv(
      'SEED_ADMIN_EMAIL',
    ).toLowerCase();

    const adminPassword = requiredEnv('SEED_ADMIN_PASSWORD');

    const companyPhone =
      process.env.SEED_COMPANY_PHONE?.trim() || null;

    const companyAddress =
      process.env.SEED_COMPANY_ADDRESS?.trim() || null;

    if (adminPassword.length < 12) {
      throw new Error(
        'SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.',
      );
    }

    await prisma.$connect();

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const company = await prisma.company.upsert({
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

    const owner = await prisma.user.upsert({
      where: {
        email: adminEmail,
      },
      update: {
        companyId: company.id,
        name: adminName,
        passwordHash,
        role: 'OWNER',
        isActive: true,
      },
      create: {
        companyId: company.id,
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: 'OWNER',
        isActive: true,
      },
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