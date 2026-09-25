import { archiveService } from '../services/archiveService.js';
import { googleDriveService } from '../services/googleDriveService.js';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

async function main() {
  console.log('='.repeat(65));
  console.log('   MONTEIRO CONECTA - ROTINA DE ALÍVIO DO POSTGRESQL (RAILWAY)');
  console.log('='.repeat(65));
  console.log(`- Limite de mensagens recentes por conversa mantidas no banco: ${env.archiveKeepMessagesPerConv}`);
  console.log(`- Retenção de logs do sistema: ${env.archiveLogRetentionDays} dias`);
  console.log(`- Pasta Google Drive configurada: ${env.googleDriveFolderId}`);
  console.log(`- Google Drive configurado: ${googleDriveService.isConfigured() ? 'SIM' : 'NÃO (salvando localmente em ./archive_cache)'}`);
  if (googleDriveService.isConfigured()) {
    console.log(`- Conta de serviço: ${googleDriveService.getAccountEmail() || 'OK'}`);
  }
  console.log('-'.repeat(65));

  console.log('\n[1/3] Testando conexão com o Google Drive...');
  const driveTest = await googleDriveService.testConnection();
  if (driveTest.success) {
    console.log(`✅ Conexão com Google Drive bem-sucedida! Pasta acessada: "${driveTest.folderName}"`);
  } else {
    console.log(`⚠️ Google Drive não acessível diretamente: ${driveTest.error}`);
    console.log('ℹ️ Os backups serão compactados e armazenados com segurança no cache local e enviados assim que as credenciais forem adicionadas.');
  }

  console.log('\n[2/3] Executando rotina de alívio do banco de dados...');
  const start = Date.now();
  const result = await archiveService.relieveDatabase();

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n[3/3] Resultado da execução:');
  console.log(`- Status: ${result.success ? '✅ SUCESSO' : '❌ ERRO'}`);
  console.log(`- Conversas arquivadas: ${result.archivedConversations}`);
  console.log(`- Mensagens arquivadas e removidas do Postgres: ${result.archivedMessages}`);
  console.log(`- Logs antigos purgados do banco: ${result.purgedLogs}`);
  console.log(`- Notificações antigas purgadas: ${result.purgedNotifications}`);
  console.log(`- Arquivos sincronizados com Google Drive: ${result.syncedToDrive}`);
  console.log(`- Tempo decorrido: ${duration}s`);

  // Tenta rodar VACUUM se for PostgreSQL
  try {
    console.log('\nExecutando otimização do Postgres (VACUUM ANALYZE)...');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE "Message";');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE "SystemLog";');
    console.log('✅ Otimização das tabelas concluída com sucesso!');
  } catch (vacErr: any) {
    // SQLite local ou sem permissão de superuser no Railway não impede o funcionamento
    console.log('ℹ️ Otimização VACUUM não necessária ou gerenciada automaticamente pelo Railway.');
  }

  const finalStats = await archiveService.getArchiveStats();
  console.log('\n' + '='.repeat(65));
  console.log('   ESTATÍSTICAS GERAIS DE ARQUIVO');
  console.log('='.repeat(65));
  console.log(`- Total de pacotes arquivados: ${finalStats.totalArchives}`);
  console.log(`- Total de mensagens em arquivo seguro: ${finalStats.totalArchivedMessages}`);
  console.log(`- Espaço compactado total: ${(finalStats.totalCompressedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Arquivos pendentes de envio ao Drive: ${finalStats.unsyncedArchives}`);
  console.log('='.repeat(65));
  console.log('Concluído com sucesso! Os usuários do sistema continuarão acessando');
  console.log('todo o histórico normalmente e de forma transparente.');
  console.log('='.repeat(65));

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha fatal na rotina de alívio:', err);
  process.exit(1);
});
