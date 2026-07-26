import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

export const dailyChallengeService = {
  async list() {
    console.log('[DC-SVC] list() querying database...');
    let items;
    try {
      items = await prisma.dailyChallenge.findMany({ orderBy: { createdAt: 'desc' } });
      console.log('[DC-SVC] list() found', items.length, 'items');
    } catch (e: any) {
      console.error('[DC-SVC] list() Prisma error:', e.name, e.message);
      console.error('[DC-SVC] stack:', e.stack);
      throw e;
    }
    return { items, total: items.length };
  },

  async get(id: string) {
    console.log('[DC-SVC] get() id:', id);
    const item = await prisma.dailyChallenge.findUnique({ where: { id } });
    if (!item) throw new AppError('Challenge not found', 404);
    return item;
  },

  async create(data: any) {
    console.log('[DC-SVC] create() data:', JSON.stringify(data));
    const result = await prisma.dailyChallenge.create({ data: { ...data, status: 'QUEUE' } });
    console.log('[DC-SVC] create() success, id:', result.id);
    return result;
  },

  async update(id: string, data: any) {
    console.log('[DC-SVC] update() id:', id, 'data:', JSON.stringify(data));
    await this.get(id);
    const result = await prisma.dailyChallenge.update({ where: { id }, data });
    console.log('[DC-SVC] update() success');
    return result;
  },

  async remove(id: string) {
    console.log('[DC-SVC] remove() id:', id);
    await this.get(id);
    const result = await prisma.dailyChallenge.delete({ where: { id } });
    console.log('[DC-SVC] remove() success');
    return result;
  },

  async getToday(userId: string) {
    const challenge = await prisma.dailyChallenge.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { publishedAt: 'desc' },
    });
    if (!challenge) return null;

    const attempt = await prisma.userDailyChallenge.findUnique({
      where: { userId_challengeId: { userId, challengeId: challenge.id } },
    });

    return { challenge, attempt };
  },

  async submit(userId: string, challengeId: string, selectedAnswer: string) {
    const challenge = await prisma.dailyChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new AppError('Challenge not found', 404);
    if (challenge.status !== 'ACTIVE') throw new AppError('Challenge is not active', 400);

    const existing = await prisma.userDailyChallenge.findUnique({
      where: { userId_challengeId: { userId, challengeId } },
    });
    if (existing) throw new AppError('You have already attempted this challenge', 400);

    const isCorrect = selectedAnswer === challenge.correctAnswer;

    const [attempt] = await Promise.all([
      prisma.userDailyChallenge.create({
        data: { userId, challengeId, selectedAnswer, isCorrect },
      }),
      this.updateStreak(userId, isCorrect),
    ]);

    return { attempt, correctAnswer: challenge.correctAnswer, explanation: challenge.explanation };
  },

  async updateStreak(userId: string, isCorrect: boolean) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = await prisma.userStreak.findUnique({ where: { userId } });
    if (!streak) {
      return prisma.userStreak.create({
        data: {
          userId,
          currentStreak: isCorrect ? 1 : 0,
          longestStreak: isCorrect ? 1 : 0,
          lastCompletedDate: today,
        },
      });
    }

    const lastDate = streak.lastCompletedDate;
    if (lastDate) {
      const last = new Date(lastDate);
      last.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) throw new AppError('Already attempted today', 400);

      if (diffDays === 1) {
        const newCurrent = isCorrect ? streak.currentStreak + 1 : 0;
        return prisma.userStreak.update({
          where: { userId },
          data: { currentStreak: newCurrent, longestStreak: Math.max(newCurrent, streak.longestStreak), lastCompletedDate: today },
        });
      }
    }

    return prisma.userStreak.update({
      where: { userId },
      data: { currentStreak: isCorrect ? 1 : 0, longestStreak: Math.max(isCorrect ? 1 : 0, streak.longestStreak), lastCompletedDate: today },
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

  async runScheduler() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // If no challenges exist at all, seed a sample one
    const total = await prisma.dailyChallenge.count();
    if (total === 0) {
      console.log('[Scheduler] No daily challenges found. Seeding a sample question...');
      await prisma.dailyChallenge.create({
        data: {
          question: 'Which language runs in the browser?',
          optionA: 'JavaScript',
          optionB: 'Python',
          optionC: 'Java',
          optionD: 'C++',
          correctAnswer: 'A',
          explanation: 'JavaScript is the primary language of the web and runs natively in all modern browsers.',
          status: 'ACTIVE',
          publishedAt: new Date(),
        },
      });
      console.log('[Scheduler] Sample daily challenge seeded successfully');
      return;
    }

    const alreadyActiveToday = await prisma.dailyChallenge.findFirst({
      where: { status: 'ACTIVE', publishedAt: { gte: today, lt: tomorrow } },
    });
    if (alreadyActiveToday) return;

    const prevActive = await prisma.dailyChallenge.findFirst({
      where: { status: 'ACTIVE' },
    });
    if (prevActive) {
      await prisma.dailyChallenge.update({
        where: { id: prevActive.id },
        data: { status: 'ARCHIVED' },
      });
    }

    const next = await prisma.dailyChallenge.findFirst({
      where: { status: 'QUEUE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) return;

    await prisma.dailyChallenge.update({
      where: { id: next.id },
      data: { status: 'ACTIVE', publishedAt: new Date() },
    });
  },
};
