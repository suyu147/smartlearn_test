/**
 * BookDbService — PostgreSQL-backed book persistence
 */

import { createLogger } from '@/lib/logger';
import prisma from '@/lib/db/client';
import { Prisma } from '@prisma/client';

const log = createLogger('BookDbService');

export interface BookRecord {
  id: string;
  userId: string;
  title: string;
  subtitle?: string;
  pageCount: number;
  status: string;
  coverGradient?: string;
  spine?: Record<string, unknown>;
  pages?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class BookDbService {
  async listBooks(userId: string): Promise<BookRecord[]> {
    try {
      return await prisma.book.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }) as BookRecord[];
    } catch (err) {
      log.error('listBooks failed:', err);
      return [];
    }
  }

  async getBook(bookId: string): Promise<BookRecord | null> {
    try {
      return await prisma.book.findUnique({ where: { id: bookId } }) as BookRecord | null;
    } catch (err) {
      log.error('getBook failed:', err);
      return null;
    }
  }

  async createBook(userId: string, data: { id?: string; title: string; subtitle?: string; coverGradient?: string }): Promise<BookRecord | null> {
    try {
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, name: 'anonymous' },
      });

      const createData: Record<string, unknown> = {
        userId,
        title: data.title,
        subtitle: data.subtitle,
        coverGradient: data.coverGradient,
      };
      if (data.id) createData.id = data.id;

      return await prisma.book.create({ data: createData as any }) as BookRecord;
    } catch (err) {
      log.error('createBook failed:', err);
      return null;
    }
  }

  async updateBook(bookId: string, data: Partial<{ title: string; status: string; pageCount: number; spine: Record<string, unknown>; pages: Record<string, unknown>; metadata: Record<string, unknown> }>): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.pageCount !== undefined) updateData.pageCount = data.pageCount;
      if (data.spine !== undefined) updateData.spine = JSON.parse(JSON.stringify(data.spine));
      if (data.pages !== undefined) updateData.pages = JSON.parse(JSON.stringify(data.pages));
      if (data.metadata !== undefined) updateData.metadata = JSON.parse(JSON.stringify(data.metadata));
      await prisma.book.update({ where: { id: bookId }, data: updateData as Prisma.BookUpdateInput });
      return true;
    } catch (err) {
      log.error('updateBook failed:', err);
      return false;
    }
  }

  async deleteBook(bookId: string): Promise<boolean> {
    try {
      await prisma.book.delete({ where: { id: bookId } });
      return true;
    } catch (err) {
      log.error('deleteBook failed:', err);
      return false;
    }
  }
}
