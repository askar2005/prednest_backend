import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function diffDays(a: Date, b: Date): number {
  const aNorm = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bNorm = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aNorm - bNorm) / DAY_MS);
}

function dayOf(d: Date | null | undefined): Date {
  return startOfDay(d ?? new Date());
}

let advanceTail: Promise<void> = Promise.resolve();

function withAdvanceLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = advanceTail.then(fn, fn);
  advanceTail = result.then(() => undefined, () => undefined);
  return result;
}

export const dailyChallengeService = {
  async list(query: { search?: string; status?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = {};
    if (query.status && ['QUEUE', 'PUBLISHED', 'ARCHIVED'].includes(query.status)) {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { question: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { topic: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total, queue, published, archived] = await Promise.all([
      prisma.dailyChallenge.findMany({
        where,
        orderBy: [{ publishedDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dailyChallenge.count({ where }),
      prisma.dailyChallenge.count({ where: { status: 'QUEUE' } }),
      prisma.dailyChallenge.count({ where: { status: 'PUBLISHED' } }),
      prisma.dailyChallenge.count({ where: { status: 'ARCHIVED' } }),
    ]);

    return { items, total, page, limit, counts: { queue, published, archived } };
  },

  async get(id: string) {
    const item = await prisma.dailyChallenge.findUnique({ where: { id } });
    if (!item) throw new AppError('Challenge not found', 404);
    return item;
  },

  async create(data: any) {
    const { status: _status, publishedAt: _publishedAt, publishedDate: _publishedDate, ...rest } = data;
    return prisma.dailyChallenge.create({ data: { ...rest, status: 'QUEUE' } });
  },

  async update(id: string, data: any) {
    await this.get(id);
    const { status: _status, publishedAt: _publishedAt, publishedDate: _publishedDate, ...rest } = data;
    return prisma.dailyChallenge.update({ where: { id }, data: rest });
  },

  async remove(id: string) {
    await this.get(id);
    return prisma.dailyChallenge.delete({ where: { id } });
  },

  async duplicate(id: string) {
    const source = await this.get(id);
    const data = {
      question: `${source.question} (Copy)`,
      optionA: source.optionA,
      optionB: source.optionB,
      optionC: source.optionC,
      optionD: source.optionD,
      correctAnswer: source.correctAnswer,
      explanation: source.explanation,
      description: source.description,
      topic: source.topic,
      difficulty: source.difficulty,
      tags: source.tags,
    };
    return prisma.dailyChallenge.create({ data: { ...data, status: 'QUEUE' } });
  },

  async archive(id: string) {
    const challenge = await this.get(id);
    if (challenge.status === 'ARCHIVED') return challenge;
    return prisma.dailyChallenge.update({ where: { id }, data: { status: 'ARCHIVED' } });
  },

  async counts() {
    const [queue, published, archived, todayPublished] = await Promise.all([
      prisma.dailyChallenge.count({ where: { status: 'QUEUE' } }),
      prisma.dailyChallenge.count({ where: { status: 'PUBLISHED' } }),
      prisma.dailyChallenge.count({ where: { status: 'ARCHIVED' } }),
      prisma.dailyChallenge.findFirst({
        where: {
          status: 'PUBLISHED',
          publishedDate: { gte: startOfDay(new Date()), lt: addDays(startOfDay(new Date()), 1) },
        },
        orderBy: { publishedAt: 'desc' },
      }),
    ]);
    return {
      counts: { queue, published, archived },
      today: {
        published: !!todayPublished,
        id: todayPublished?.id ?? null,
        question: todayPublished?.question ?? null,
      },
    };
  },

  /**
   * Idempotently ensures a challenge is PUBLISHED for the given calendar day.
   * Archives LEFT-OVER published challenges, then publishes the next QUEUE item.
   */
  async ensureDayPublished(target: Date = new Date()): Promise<{ published: boolean; challenge: unknown; queue: number }> {
    const dayStart = startOfDay(target);
    const dayEnd = addDays(dayStart, 1);

    return withAdvanceLock(async () => {
      const existing = await prisma.dailyChallenge.findFirst({
        where: { status: 'PUBLISHED', publishedDate: { gte: dayStart, lt: dayEnd } },
        orderBy: { publishedAt: 'desc' },
      });

      if (existing) {
        const queueCount = await prisma.dailyChallenge.count({ where: { status: 'QUEUE' } });
        return { published: true, challenge: existing, queue: queueCount };
      }

      const next = await prisma.dailyChallenge.findFirst({
        where: { status: 'QUEUE' },
        orderBy: { createdAt: 'asc' },
      });

      if (!next) {
        const publishedCount = await prisma.dailyChallenge.count({ where: { status: 'PUBLISHED' } });
        if (publishedCount > 0) {
          await prisma.dailyChallenge.updateMany({ where: { status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
        }
        return { published: false, challenge: null, queue: 0 };
      }

      await prisma.dailyChallenge.updateMany({ where: { status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
      const challenge = await prisma.dailyChallenge.update({
        where: { id: next.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedDate: dayStart },
      });
      const queueCount = await prisma.dailyChallenge.count({ where: { status: 'QUEUE' } });
      return { published: true, challenge, queue: queueCount };
    }) as Promise<{ published: boolean; challenge: unknown; queue: number }>;
  },

  async runScheduler() {
    return this.ensureDayPublished(new Date());
  },

  async getToday(userId: string) {
    const todayStart = startOfDay(new Date());
    const todayEnd = addDays(todayStart, 1);

    await this.ensureDayPublished(new Date());

    const challenge = await prisma.dailyChallenge.findFirst({
      where: { status: 'PUBLISHED', publishedDate: { gte: todayStart, lt: todayEnd } },
      orderBy: { publishedAt: 'desc' },
    });
    if (!challenge) return null;

    const attempt = await prisma.userDailyChallenge.findUnique({
      where: { userId_challengeId: { userId, challengeId: challenge.id } },
    });

    return { challenge, attempt };
  },

  async submit(userId: string, challengeId: string, selectedAnswer: string) {
    const challenge = await this.get(challengeId);
    if (challenge.status !== 'PUBLISHED') throw new AppError('Challenge is not published yet', 400);

    const pubDay = dayOf(challenge.publishedDate ?? challenge.publishedAt);
    const today = startOfDay(new Date());
    if (pubDay > today) throw new AppError('This challenge is not available yet', 400);

    const existing = await prisma.userDailyChallenge.findUnique({
      where: { userId_challengeId: { userId, challengeId } },
    });
    if (existing) throw new AppError('You have already attempted this challenge', 400);

    const isCorrect = selectedAnswer === challenge.correctAnswer;

    return prisma.$transaction(async (tx) => {
      const attempt = await tx.userDailyChallenge.create({
        data: { userId, challengeId, selectedAnswer, isCorrect },
      });
      await this.updateStreak(userId, isCorrect, dayOf(new Date()), tx);

      return { attempt, correctAnswer: challenge.correctAnswer, explanation: challenge.explanation };
    });
  },

  async updateStreak(userId: string, isCorrect: boolean, completedDay: Date, tx: Prisma.TransactionClient = prisma) {
    const streak = await tx.userStreak.findUnique({ where: { userId } });

    if (!streak) {
      return tx.userStreak.create({
        data: {
          userId,
          currentStreak: isCorrect ? 1 : 0,
          longestStreak: isCorrect ? 1 : 0,
          lastCompletedDate: completedDay,
        },
      });
    }

    const last = streak.lastCompletedDate ? dayOf(streak.lastCompletedDate) : null;
    if (last) {
      const diff = diffDays(completedDay, last);
      if (diff === 0) {
        if (isCorrect && streak.currentStreak === 0) {
          return tx.userStreak.update({
            where: { userId },
            data: {
              currentStreak: 1,
              longestStreak: Math.max(1, streak.longestStreak),
              lastCompletedDate: completedDay,
            },
          });
        }
        return streak;
      }
      if (diff === 1) {
        const current = isCorrect ? streak.currentStreak + 1 : 0;
        return tx.userStreak.update({
          where: { userId },
          data: {
            currentStreak: current,
            longestStreak: Math.max(current, streak.longestStreak),
            lastCompletedDate: completedDay,
          },
        });
      }
      if (diff < 1) return streak;
    }

    const current = isCorrect ? 1 : 0;
    return tx.userStreak.update({
      where: { userId },
      data: {
        currentStreak: current,
        longestStreak: Math.max(current, streak.longestStreak),
        lastCompletedDate: completedDay,
      },
    });
  },

  async getStreak(userId: string) {
    let streak = await prisma.userStreak.findUnique({ where: { userId } });
    if (!streak) {
      streak = await prisma.userStreak.create({
        data: { userId, currentStreak: 0, longestStreak: 0 },
      });
    }
    return streak;
  },

  async getHistory(userId: string, query: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = { userId };
    const [items, total] = await Promise.all([
      prisma.userDailyChallenge.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          challenge: {
            select: {
              id: true,
              question: true,
              correctAnswer: true,
              topic: true,
              difficulty: true,
              publishedDate: true,
            },
          },
        },
      }),
      prisma.userDailyChallenge.count({ where }),
    ]);
    return { items, total, page, limit };
  },
};