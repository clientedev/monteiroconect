import { archiveService } from '../services/archiveService.js';
import { prisma } from '../database/client.js';

async function main() {
  console.log('='.repeat(65));
  console.log('   MONTEIRO CONECTA - ROTINA DE ALÍVIO DO POSTGRESQL');
  console.log('   (Estratégia: WhatsApp Cloud Backup + Retenção de 5 Dias)');
  console.log('='.repeat(65));

  console.log('\n[1/2] Executando rotina de limpeza de mensagens antigas (> 5 dias)...');
  const start = Date.now();
  const result = await archiveService.cleanOldMessages({ retentionDays: 5 });

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n[2/2] Resultado da execução:');
  console.log(`- Status: ${result.success ? '✅ SUCESSO' : '❌ ERRO'}`);
  console.log(`- Mensagens antigas excluídas do Postgres: ${result.archivedMessages}`);
  console.log(`- Mensagens ativas restantes (últimos 5 dias): ${result.activeMessagesRemaining}`);
  console.log(`- Logs antigos purgados do banco: ${result.purgedLogs}`);
  console.log(`- Notificações antigas purgadas: ${result.purgedNotifications}`);
  console.log(`- Tempo decorrido: ${duration}s`);

  // Tenta rodar VACUUM se for PostgreSQL
  try {
    console.log('\nExecutando otimização do Postgres (VACUUM ANALYZE)...');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE "Message";');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE "SystemLog";');
    console.log('✅ Otimização das tabelas concluída com sucesso!');
  } catch {
    console.log('ℹ️ Otimização VACUUM não necessária ou gerenciada automaticamente pelo Railway.');
  }

  console.log('\n' + '='.repeat(65));
  console.log('   ROUTINA CONCLUÍDA COM SUCESSO');
  console.log('='.repeat(65));
}

main()
  .catch((e) => {
    console.error('Falha na execução do alívio:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
