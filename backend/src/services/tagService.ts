import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

export async function createTag(name: string, color: string) {
  const existing = await prisma.tag.findUnique({ where: { name } });
  if (existing) throw new AppError('Etiqueta já existe', 409);
  return prisma.tag.create({ data: { name, color } });
}

export async function updateTag(id: string, data: { name?: string; color?: string }) {
  return prisma.tag.update({ where: { id }, data });
}

export async function deleteTag(id: string) {
  return prisma.tag.delete({ where: { id } });
}

export async function addTagToConversation(conversationId: string, tagId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new AppError('Conversa não encontrada', 404);
  return prisma.conversationTag.create({
    data: { conversationId, contactId: conv.contactId, tagId },
  });
}

export async function removeTagFromConversation(conversationId: string, tagId: string) {
  const record = await prisma.conversationTag.findUnique({
    where: { conversationId_tagId: { conversationId, tagId } },
  });
  if (!record) throw new AppError('Etiqueta não encontrada nesta conversa', 404);
  return prisma.conversationTag.delete({ where: { id: record.id } });
}
