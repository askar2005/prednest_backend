import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const real = await p.dailyChallenge.findUnique({ where: { id: '9093d2ac-b966-4db5-8b14-5b2f9588872a' } });
  if (real) {
    await p.dailyChallenge.update({
      where: { id: real.id },
      data: { status: 'PUBLISHED', publishedDate: new Date('2026-08-07T00:00:00.000Z') },
    });
    console.log('republished real challenge for Aug 7:', real.question.slice(0, 30));
  }
  const ch = await p.dailyChallenge.findFirst({ where: { status: 'PUBLISHED', publishedDate: { gte: new Date('2026-08-07T00:00:00.000Z'), lt: new Date('2026-08-08T00:00:00.000Z') } } });
  const u = await p.user.findUnique({ where: { email: 'askarali7674@gmail.com' } });
  if (u && ch) {
    const att = await p.userDailyChallenge.findUnique({ where: { userId_challengeId: { userId: u.id, challengeId: ch.id } } });
    if (att?.isCorrect) {
      const s = await p.userStreak.findUnique({ where: { userId: u.id } });
      if (s && s.currentStreak === 0) {
        await p.userStreak.update({ where: { id: s.id }, data: { currentStreak: 1, longestStreak: Math.max(1, s.longestStreak) } });
        console.log(`repaired streak -> current=1 longest=${Math.max(1, s.longestStreak)}`);
      } else console.log('streak row ok', s);
    }
  }
  await p.$disconnect();
})();
