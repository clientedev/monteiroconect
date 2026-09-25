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

  constructor() {
    this.init();
  }

  private init() {
    if (this.initialized) return;

    try {
      let credentials: any = null;

      if (env.googleServiceAccountJson) {
        let jsonStr = env.googleServiceAccountJson.trim();
        // Permite passar em base64 se a quebra de linha do JSON quebrar no Railway
        if (!jsonStr.startsWith('{')) {
          try {
            jsonStr = Buffer.from(jsonStr, 'base64').toString('utf-8');
          } catch {
            // Se falhar base64, tenta como string direta
          }
        }
        credentials = JSON.parse(jsonStr);
      } else if (env.googleServiceAccountKeyPath) {
        const resolved = path.resolve(env.googleServiceAccountKeyPath);
        if (fs.existsSync(resolved)) {
          credentials = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        }
      }

      if (credentials) {
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
        logger.info(`Google Drive Service inicializado com conta: ${this.serviceAccountEmail}`);
      } else {
        logger.info('Google Drive: Credenciais de Service Account não configuradas ainda. Armazenando localmente em cache.');
      }
    } catch (err: any) {
      logger.error('Erro ao inicializar Google Drive Service:', err?.message || err);
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

  /**
   * Testa a conexão e verifica acesso à pasta do Google Drive
   */
  public async testConnection(): Promise<{ success: boolean; folderName?: string; email?: string; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Credenciais de Service Account não configuradas (defina GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_SERVICE_ACCOUNT_KEY_PATH).',
      };
    }

    try {
      const folder = await this.driveClient.files.get({
        fileId: env.googleDriveFolderId,
        fields: 'id, name, capabilities',
      });

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
      logger.warn(`Google Drive não configurado. Upload de "${opts.name}" pulado.`);
      return null;
    }

    try {
      const folderId = opts.folderId || env.googleDriveFolderId;
      const media = {
        mimeType: opts.mimeType || 'application/gzip',
        body: Readable.from(opts.content),
      };

      const res = await this.driveClient.files.create({
        requestBody: {
          name: opts.name,
          parents: [folderId],
        },
        media,
        fields: 'id, name, size',
      });

      logger.info(`Arquivo enviado para o Google Drive: ${opts.name} (ID: ${res.data.id})`);
      return {
        fileId: res.data.id,
        name: res.data.name,
      };
    } catch (err: any) {
      logger.error(`Erro ao fazer upload para Google Drive (${opts.name}):`, err?.message || err);
      throw err;
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
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
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
      await this.driveClient.files.delete({ fileId });
      return true;
    } catch (err: any) {
      logger.warn(`Erro ao excluir arquivo no Google Drive (${fileId}):`, err?.message || err);
      return false;
    }
  }
}

export const googleDriveService = new GoogleDriveService();
