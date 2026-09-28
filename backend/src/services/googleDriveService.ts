import { google } from 'googleapis';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

class GoogleDriveService {
  private driveClient: any = null;
  private serviceAccountEmail: string | null = null;
  private initialized = false;
  private lastInitError: string | null = null;
  private lastTestResult: { success: boolean; folderName?: string; email?: string; error?: string; timestamp: number } | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (this.initialized) return;

    try {
      let credentials: any = null;

      if (env.googleServiceAccountJson && env.googleServiceAccountJson.trim().length > 0) {
        let jsonStr = env.googleServiceAccountJson.trim();

        // Remove aspas externas se o Railway tiver envolvido o valor em aspas
        if (
          (jsonStr.startsWith('"') && jsonStr.endsWith('"')) ||
          (jsonStr.startsWith("'") && jsonStr.endsWith("'"))
        ) {
          jsonStr = jsonStr.slice(1, -1).trim();
        }

        // Permite passar em base64 se a quebra de linha do JSON quebrar no Railway
        if (!jsonStr.startsWith('{')) {
          try {
            const decoded = Buffer.from(jsonStr, 'base64').toString('utf-8');
            if (decoded.startsWith('{')) {
              jsonStr = decoded;
            }
          } catch {
            // Se falhar base64, tenta como string direta
          }
        }

        try {
          credentials = JSON.parse(jsonStr);
        } catch (jsonErr: any) {
          this.lastInitError = `Falha ao interpretar GOOGLE_SERVICE_ACCOUNT_JSON: ${jsonErr?.message || jsonErr}`;
          logger.error(this.lastInitError);
        }
      } else if (env.googleServiceAccountKeyPath && env.googleServiceAccountKeyPath.trim().length > 0) {
        const resolved = path.resolve(env.googleServiceAccountKeyPath.trim());
        if (fs.existsSync(resolved)) {
          try {
            credentials = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
          } catch (fileErr: any) {
            this.lastInitError = `Falha ao ler arquivo de chave GOOGLE_SERVICE_ACCOUNT_KEY_PATH (${resolved}): ${fileErr?.message || fileErr}`;
            logger.error(this.lastInitError);
          }
        } else {
          this.lastInitError = `Arquivo de chave não encontrado: ${resolved}`;
        }
      } else {
        this.lastInitError = 'Variável GOOGLE_SERVICE_ACCOUNT_JSON não configurada no Railway.';
      }

      if (credentials) {
        // Corrige quebras de linha na private_key (frequente em containers Docker e Railway onde \n vira string literal)
        if (credentials.private_key && typeof credentials.private_key === 'string') {
          credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }

        this.serviceAccountEmail = credentials.client_email || null;
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive',
          ],
        });

        this.driveClient = google.drive({ version: 'v3', auth });
        this.initialized = true;
        this.lastInitError = null;
        logger.info(`Google Drive Service inicializado com conta: ${this.serviceAccountEmail}`);
      } else {
        logger.info(`Google Drive: ${this.lastInitError || 'Credenciais de Service Account não configuradas ainda. Armazenando localmente em cache.'}`);
      }
    } catch (err: any) {
      this.lastInitError = `Erro ao inicializar Google Drive Service: ${err?.message || err}`;
      logger.error(this.lastInitError);
    }
  }

  public isConfigured(): boolean {
    if (!this.initialized) {
      this.init();
    }
    return !!this.driveClient;
  }

  public getAccountEmail(): string | null {
    return this.serviceAccountEmail;
  }

  public getInitError(): string | null {
    return this.lastInitError;
  }

  public getCleanFolderId(customId?: string): string {
    const raw = customId || env.googleDriveFolderId || '1kTk-ANgqNWa9ff25l4_FK-7LrjnKpJb_';
    let str = raw.trim();
    const match = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
    const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
      return matchId[1];
    }
    str = str.split('?')[0].split('&')[0];
    str = str.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '');
    return str || '1kTk-ANgqNWa9ff25l4_FK-7LrjnKpJb_';
  }

  /**
   * Helper com timeout estrito garantido via Promise.race
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Tempo limite excedido (${timeoutMs / 1000}s) durante: ${operationName}`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timer!);
      return result;
    } catch (err) {
      clearTimeout(timer!);
      throw err;
    }
  }

  /**
   * Testa a conexão e verifica acesso à pasta do Google Drive (com cache de 20s e timeout de 6s)
   */
  public async testConnection(forceRefresh = false): Promise<{ success: boolean; folderName?: string; email?: string; error?: string }> {
    if (!forceRefresh && this.lastTestResult && (Date.now() - this.lastTestResult.timestamp < 20000)) {
      return {
        success: this.lastTestResult.success,
        folderName: this.lastTestResult.folderName,
        email: this.lastTestResult.email,
        error: this.lastTestResult.error,
      };
    }

    if (!this.isConfigured()) {
      const res = {
        success: false,
        error: this.lastInitError || 'Credenciais de Service Account não configuradas (defina GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente).',
      };
      this.lastTestResult = { ...res, timestamp: Date.now() };
      return res;
    }

    const targetFolderId = this.getCleanFolderId();

    try {
      const folderPromise = this.driveClient.files.get({
        fileId: targetFolderId,
        fields: 'id, name, capabilities',
        supportsAllDrives: true,
      });

      const folder: any = await this.withTimeout(folderPromise, 6000, 'Verificar pasta no Google Drive');

      if (folder.data.capabilities && folder.data.capabilities.canAddChildren === false) {
        const res = {
          success: false,
          folderName: folder.data.name,
          email: this.serviceAccountEmail || undefined,
          error: `A conta ${this.serviceAccountEmail} tem acesso à pasta "${folder.data.name}", mas apenas como LEITOR. No Google Drive, clique em Compartilhar e mude para EDITOR.`,
        };
        this.lastTestResult = { ...res, timestamp: Date.now() };
        return res;
      }

      const res = {
        success: true,
        folderName: folder.data.name,
        email: this.serviceAccountEmail || undefined,
      };
      this.lastTestResult = { ...res, timestamp: Date.now() };
      return res;
    } catch (err: any) {
      const rawMsg = err?.response?.data?.error?.message || err?.message || String(err);
      let friendlyError = rawMsg;

      if (rawMsg.includes('File not found') || rawMsg.includes('404')) {
        friendlyError = `A pasta "${this.getCleanFolderId()}" não foi encontrada para a conta ${this.serviceAccountEmail}. Abra a pasta no Google Drive, clique em Compartilhar e adicione o e-mail "${this.serviceAccountEmail}" como EDITOR.`;
      } else if (rawMsg.includes('The caller does not have permission') || rawMsg.includes('403')) {
        friendlyError = `Permissão negada (403). Adicione a conta de serviço "${this.serviceAccountEmail}" na pasta do Google Drive como EDITOR.`;
      } else if (rawMsg.includes('Tempo limite')) {
        friendlyError = `Tempo limite ao conectar com a API do Google (6s). Verifique sua chave de serviço ou conexão de rede.`;
      }

      const res = {
        success: false,
        email: this.serviceAccountEmail || undefined,
        error: friendlyError,
      };
      this.lastTestResult = { ...res, timestamp: Date.now() };
      return res;
    }
  }

  /**
   * Faz upload de arquivo para a pasta do Google Drive (com timeout estrito de 12s)
   */
  public async uploadFile(opts: {
    name: string;
    mimeType?: string;
    content: Buffer;
    folderId?: string;
  }): Promise<{ fileId: string; name: string } | null> {
    if (!this.isConfigured()) {
      const reason = this.lastInitError || 'Google Drive não configurado nas variáveis de ambiente';
      logger.warn(`Upload de "${opts.name}" pulado: ${reason}`);
      throw new Error(`Google Drive não configurado: ${reason}`);
    }

    try {
      const folderId = this.getCleanFolderId(opts.folderId);
      const media = {
        mimeType: opts.mimeType || 'application/gzip',
        body: Readable.from(opts.content),
      };

      const createPromise = this.driveClient.files.create({
        requestBody: {
          name: opts.name,
          parents: [folderId],
        },
        media,
        fields: 'id, name, size',
        supportsAllDrives: true,
      });

      const res: any = await this.withTimeout(createPromise, 12000, `Upload de ${opts.name}`);

      logger.info(`Arquivo enviado para o Google Drive: ${opts.name} (ID: ${res.data.id})`);
      return {
        fileId: res.data.id,
        name: res.data.name,
      };
    } catch (err: any) {
      const rawMsg = err?.response?.data?.error?.message || err?.message || String(err);
      let friendlyMsg = rawMsg;
      if (rawMsg.includes('File not found') || rawMsg.includes('404')) {
        friendlyMsg = `Pasta ${env.googleDriveFolderId} não encontrada ou sem acesso. Compartilhe a pasta com ${this.serviceAccountEmail} como Editor.`;
      } else if (rawMsg.includes('403') || rawMsg.includes('permission')) {
        friendlyMsg = `Sem permissão de gravação na pasta. Compartilhe a pasta com ${this.serviceAccountEmail} como Editor.`;
      }
      logger.error(`Erro ao fazer upload para Google Drive (${opts.name}): ${friendlyMsg}`);
      throw new Error(friendlyMsg);
    }
  }

  /**
   * Baixa o arquivo do Google Drive em memória como Buffer
   */
  public async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error('Google Drive não configurado para download de arquivo');
    }

    try {
      const dlPromise = this.driveClient.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
      );

      const res: any = await this.withTimeout(dlPromise, 15000, `Download do arquivo ${fileId}`);
      return Buffer.from(res.data);
    } catch (err: any) {
      logger.error(`Erro ao baixar arquivo do Google Drive (${fileId}):`, err?.message || err);
      throw err;
    }
  }

  /**
   * Remove arquivo do Google Drive se necessário
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const delPromise = this.driveClient.files.delete({ fileId, supportsAllDrives: true });
      await this.withTimeout(delPromise, 8000, `Exclusão do arquivo ${fileId}`);
      return true;
    } catch (err: any) {
      logger.warn(`Erro ao excluir arquivo no Google Drive (${fileId}):`, err?.message || err);
      return false;
    }
  }
}

export const googleDriveService = new GoogleDriveService();
