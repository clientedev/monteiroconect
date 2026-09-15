import {
  initAuthCreds,
  BufferJSON,
  proto,
  AuthenticationState,
  SignalDataTypeMap,
  AuthenticationCreds,
} from '@whiskeysockets/baileys';
import { prisma } from '../database/client.js';

/**
 * Adaptador de estado de autenticação do Baileys para o Prisma (PostgreSQL).
 * Isso garante que o estado do WhatsApp sobreviva a redeploys em hospedagens efêmeras.
 */
export const usePrismaAuthState = async (whatsappId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>, clearState: () => Promise<void> }> => {
  const writeData = async (dataId: string, data: any) => {
    try {
      const dataStr = JSON.stringify(data, BufferJSON.replacer);
      await prisma.baileysAuthState.upsert({
        where: { whatsappId_dataId: { whatsappId, dataId } },
        update: { data: dataStr },
        create: { whatsappId, dataId, data: dataStr },
      });
    } catch (err) {
      console.error(`Error writing auth state to db (${dataId}):`, err);
    }
  };

  const readData = async (dataId: string) => {
    try {
      const record = await prisma.baileysAuthState.findUnique({
        where: { whatsappId_dataId: { whatsappId, dataId } },
      });
      if (record) {
        return JSON.parse(record.data, BufferJSON.reviver);
      }
    } catch (err) {
      console.error(`Error reading auth state from db (${dataId}):`, err);
    }
    return null;
  };

  const removeData = async (dataId: string) => {
    try {
      await prisma.baileysAuthState.delete({
        where: { whatsappId_dataId: { whatsappId, dataId } },
      });
    } catch {
      // Ignora erro se não existir
    }
  };

  const clearState = async () => {
    try {
      await prisma.baileysAuthState.deleteMany({
        where: { whatsappId },
      });
    } catch (err) {
      console.error(`Error clearing auth state from db:`, err);
    }
  };

  let creds: AuthenticationCreds;
  const credsData = await readData('creds');
  if (credsData) {
    creds = credsData;
  } else {
    creds = initAuthCreds();
    await writeData('creds', creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const keys = data[category as keyof SignalDataTypeMap];
            if (keys) {
              for (const id in keys) {
                const value = keys[id];
                const dataId = `${category}-${id}`;
                if (value) {
                  tasks.push(writeData(dataId, value));
                } else {
                  tasks.push(removeData(dataId));
                }
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => {
      return writeData('creds', creds);
    },
    clearState,
  };
};
