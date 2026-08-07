import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const tests = await p.mockTest.findMany({ include: { questions: { select: { marks: true } } } });
  let cleared = 0, backfilled = 0;
  for (const t of tests) {
    const patch: Record<string, unknown> = {};
    if (t.scheduledAt) { patch.scheduledAt = null; cleared++; }
    if (t.totalMarks === null || t.totalMarks === undefined) {
      const sum = t.questions.reduce((s, q) => s + (q.marks || 1), 0);
      patch.totalMarks = sum; backfilled++;
    }
    if (Object.keys(patch).length) await p.mockTest.update({ where: { id: t.id }, data: patch });
  }
  console.log(`cleared scheduledAt on ${cleared} tests, backfilled totalMarks on ${backfilled} tests`);
  const pub = await p.mockTest.findMany({ where: { publishStatus: 'PUBLISHED' }, select: { id: true, title: true, scheduledAt: true, totalMarks: true } });
  for (const t of pub) console.log('PUBLISHED NOW VISIBLE:', t.title, '| scheduledAt:', t.scheduledAt, '| totalMarks:', t.totalMarks);
  await p.$disconnect();
})();
