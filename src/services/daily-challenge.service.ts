import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TZ_OFFSET_MINUTES = 330;
const CHALLENGE_TZ_OFFSET_MS = CHALLENGE_TZ_OFFSET_MINUTES * 60 * 1000;

function toChallengeDateParts(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() + CHALLENGE_TZ_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function startOfChallengeDay(d: Date): Date {
  const { year, month, day } = toChallengeDateParts(d);
  return new Date(Date.UTC(year, month, day) - CHALLENGE_TZ_OFFSET_MS);
}

function addChallengeDays(d: Date, n: number): Date {
  const parts = toChallengeDateParts(d);
  return new Date(Date.UTC(parts.year, parts.month, parts.day + n) - CHALLENGE_TZ_OFFSET_MS);
}

function diffChallengeDays(a: Date, b: Date): number {
  const aParts = toChallengeDateParts(a);
  const bParts = toChallengeDateParts(b);
  const aNorm = Date.UTC(aParts.year, aParts.month, aParts.day);
  const bNorm = Date.UTC(bParts.year, bParts.month, bParts.day);
  return Math.round((aNorm - bNorm) / DAY_MS);
}

function dayOf(d: Date | null | undefined): Date {
  return startOfChallengeDay(d ?? new Date());
}

function challengeNow(): Date {
  return new Date();
}

function isSameChallengeDay(a: Date, b: Date): boolean {
  return diffChallengeDays(a, b) === 0;
}

function isYesterdayChallengeDay(today: Date, yesterdayCandidate: Date): boolean {
  return diffChallengeDays(today, yesterdayCandidate) === 1;
}

function normalizeStreakForDay(streak: { currentStreak: number; longestStreak: number; lastCompletedDate: Date | null }, today: Date) {
  const last = streak.lastCompletedDate ? dayOf(streak.lastCompletedDate) : null;
  if (!last) return streak;
  const diff = diffChallengeDays(today, last);
  if (diff <= 1) return streak;
  if (streak.currentStreak === 0) return streak;
  return {
    ...streak,
    currentStreak: 0,
  };
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
          publishedDate: { gte: startOfChallengeDay(challengeNow()), lt: addChallengeDays(challengeNow(), 1) },
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
    const dayStart = startOfChallengeDay(target);
    const dayEnd = addChallengeDays(target, 1);

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
    return this.ensureDayPublished(challengeNow());
  },

  async getToday(userId: string) {
    const today = challengeNow();
    const todayStart = startOfChallengeDay(today);
    const todayEnd = addChallengeDays(today, 1);

    await this.ensureDayPublished(today);

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
    const today = startOfChallengeDay(challengeNow());
    if (pubDay > today) throw new AppError('This challenge is not available yet', 400);

    const isCorrect = selectedAnswer === challenge.correctAnswer;
    const completedDay = dayOf(challenge.publishedDate ?? challenge.publishedAt);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.userDailyChallenge.findUnique({
          where: { userId_challengeId: { userId, challengeId } },
        });
        if (existing) {
          const streak = await this.getStreak(userId, tx);
          return { attempt: existing, correctAnswer: challenge.correctAnswer, explanation: challenge.explanation, streak };
        }

        const attempt = await tx.userDailyChallenge.create({
          data: { userId, challengeId, selectedAnswer, isCorrect },
        });

        const streak = await this.updateStreak(userId, isCorrect, completedDay, tx);

        return { attempt, correctAnswer: challenge.correctAnswer, explanation: challenge.explanation, streak };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return result;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const attempt = await prisma.userDailyChallenge.findUnique({
          where: { userId_challengeId: { userId, challengeId } },
        });
        const streak = await this.getStreak(userId);
        return { attempt, correctAnswer: challenge.correctAnswer, explanation: challenge.explanation, streak };
      }
      throw error;
    }
  },

  async updateStreak(userId: string, isCorrect: boolean, completedDay: Date, tx: Prisma.TransactionClient = prisma) {
    const existing = await tx.userStreak.findUnique({ where: { userId } });

    const base = existing ?? (await tx.userStreak.create({
      data: { userId, currentStreak: 0, longestStreak: 0, lastCompletedDate: null },
    }));

    const normalized = normalizeStreakForDay(base, completedDay);
    const lastCompleted = normalized.lastCompletedDate ? dayOf(normalized.lastCompletedDate) : null;
    const lastDiff = lastCompleted ? diffChallengeDays(completedDay, lastCompleted) : null;

    let currentStreak = normalized.currentStreak;
    let longestStreak = normalized.longestStreak;

    if (lastDiff === 0) {
      return normalized;
    }

    if (isCorrect) {
      if (lastDiff === 1 && currentStreak > 0) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = Math.max(0, currentStreak - 1);
    }

    const updated = await tx.userStreak.update({
      where: { userId },
      data: {
        currentStreak,
        longestStreak,
        lastCompletedDate: isCorrect ? completedDay : normalized.lastCompletedDate,
      },
    });

    return updated;
  },

  async getStreak(userId: string, tx: Prisma.TransactionClient = prisma) {
    let streak = await tx.userStreak.findUnique({ where: { userId } });
    if (!streak) {
      streak = await tx.userStreak.create({
        data: { userId, currentStreak: 0, longestStreak: 0, lastCompletedDate: null },
      });
    }

    const today = startOfChallengeDay(challengeNow());
    const normalized = normalizeStreakForDay(streak, today);
    if (
      normalized.currentStreak !== streak.currentStreak ||
      normalized.longestStreak !== streak.longestStreak ||
      normalized.lastCompletedDate?.getTime() !== streak.lastCompletedDate?.getTime()
    ) {
      streak = await tx.userStreak.update({
        where: { userId },
        data: { currentStreak: normalized.currentStreak },
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
