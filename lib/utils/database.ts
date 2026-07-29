import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const db = {
  stageOutlines: {
    get: async (stageId: string) => {
      return prisma.stageOutline.findUnique({ where: { stageId } }) as Promise<{
        stageId: string;
        outlines: unknown[];
        createdAt: Date;
        updatedAt: Date;
      } | undefined>;
    },
    put: async (record: { stageId: string; outlines: unknown[]; createdAt: Date; updatedAt: Date }) => {
      return prisma.stageOutline.upsert({
        where: { stageId: record.stageId },
        update: { outlines: JSON.parse(JSON.stringify(record.outlines)) },
        create: {
          stageId: record.stageId,
          outlines: JSON.parse(JSON.stringify(record.outlines)),
        },
      });
    },
  },
} as const;

export default prisma;
