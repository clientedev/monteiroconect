import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed: Criando dados iniciais...');

  // Create admin
  const existing = await prisma.user.findFirst();
  if (!existing) {
    await prisma.user.create({
      data: {
        username: env.adminUsername,
        email: env.adminEmail,
        password: await bcrypt.hash(env.adminPassword, 12),
        role: 'admin',
      },
    });
    console.log(`Admin criado: ${env.adminUsername}`);
  }

  // Create default tags
  const defaultTags = [
    { name: 'Novo cliente', color: '#10B981' },
    { name: 'Orçamento', color: '#F59E0B' },
    { name: 'Pagamento', color: '#3B82F6' },
    { name: 'Suporte', color: '#8B5CF6' },
    { name: 'Urgente', color: '#EF4444' },
    { name: 'Finalizado', color: '#6B7280' },
  ];

  for (const tag of defaultTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }

  console.log('Seed concluído');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
