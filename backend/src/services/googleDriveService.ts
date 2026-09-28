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

  constructor() {
    this.init();
  }

  private init() {
    if (this.initialized) return;

    try {
      let credentials: any = null;

      if (env.googleServiceAccountJson && env.googleServiceAccountJson.trim().length > 0) {
        let jsonStr = env.googleServiceAccountJson.trim();

        // Remove aspas externas se o Railway ou .env tiver envolvido em aspas
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

  /**
   * Testa a conexão e verifica acesso à pasta do Google Drive
   */
  public async testConnection(): Promise<{ success: boolean; folderName?: string; email?: string; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: this.lastInitError || 'Credenciais de Service Account não configuradas (defina GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente).',
      };
    }

    try {
      const folder = await this.driveClient.files.get(
        {
          fileId: env.googleDriveFolderId,
          fields: 'id, name, capabilities',
          supportsAllDrives: true,
        },
        { timeout: 15000 }
      );

      if (folder.data.capabilities && folder.data.capabilities.canAddChildren === false) {
        return {
          success: false,
          folderName: folder.data.name,
          email: this.serviceAccountEmail || undefined,
          error: `A conta ${this.serviceAccountEmail} tem acesso à pasta "${folder.data.name}", mas com permissão de LEITOR. Compartilhe a pasta com ela como EDITOR para permitir o envio dos backups.`,
        };
      }

      return {
        success: true,
        folderName: folder.data.name,
        email: this.serviceAccountEmail || undefined,
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || String(err);
      return {
        success: false,
        email: this.serviceAccountEmail || undefined,
        error: `Falha ao acessar pasta no Google Drive (${env.googleDriveFolderId}): ${msg}. Certifique-se de compartilhar a pasta com ${this.serviceAccountEmail || 'a conta de serviço'} como Editor.`,
      };
    }
  }

  /**
   * Faz upload de arquivo para a pasta do Google Drive
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
      const folderId = opts.folderId || env.googleDriveFolderId;
      const media = {
        mimeType: opts.mimeType || 'application/gzip',
        body: Readable.from(opts.content),
      };

      const res = await this.driveClient.files.create(
        {
          requestBody: {
            name: opts.name,
            parents: [folderId],
          },
          media,
          fields: 'id, name, size',
          supportsAllDrives: true,
        },
        { timeout: 35000 }
      );

      logger.info(`Arquivo enviado para o Google Drive: ${opts.name} (ID: ${res.data.id})`);
      return {
        fileId: res.data.id,
        name: res.data.name,
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || String(err);
      logger.error(`Erro ao fazer upload para Google Drive (${opts.name}): ${msg}`);
      throw new Error(`Erro ao enviar arquivo para o Google Drive: ${msg}`);
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
      const res = await this.driveClient.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer', timeout: 30000 }
      );

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
      await this.driveClient.files.delete(
        { fileId, supportsAllDrives: true },
        { timeout: 15000 }
      );
      return true;
    } catch (err: any) {
      logger.warn(`Erro ao excluir arquivo no Google Drive (${fileId}):`, err?.message || err);
      return false;
    }
  }
}

export const googleDriveService = new GoogleDriveService();
