import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { dailyChallengeService } from '../src/services/daily-challenge.service.js';

const prisma = new PrismaClient();
const BASE = 'http://localhost:4000/api';
const MARK = 'DC-TEST-';

const results: Array<{ n: number; name: string; pass: boolean; detail?: string }> = [];

async function req(method: string, path: string, body: any = undefined, token: string = '') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = method !== 'GET' && method !== 'HEAD' && body !== undefined;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { }
  return { status: res.status, data };
}

function check(n: number, name: string, pass: boolean, detail?: string) {
  results.push({ n, name, pass, detail });
  console.log(`T${String(n).padStart(2, '0')} ${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

const localDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function signupAndLogin(name: string, tag: string) {
  const email = `${tag}_${Date.now()}@test.com`;
  const passwordHash = await bcrypt.hash('Test@123', 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, isVerified: true } });
  const login = await req('POST', '/auth/login', { email, password: 'Test@123' });
  return { token: login.data?.token, userId: user.id };
}

async function main() {
  // Idempotence: remove leftovers from previous runs
  await prisma.user.deleteMany({ where: { email: { startsWith: 'dc_' } } });
  await prisma.dailyChallenge.deleteMany({ where: { question: { startsWith: MARK } } });

  const adminLogin = await req('POST', '/admin/login', { email: 'admin@prepnest.com', password: 'Test@123' });
  const at = adminLogin.data?.token;
  const ua = await signupAndLogin('DC UA', 'dc_ua');
  const ub = await signupAndLogin('DC UB', 'dc_ub');
  if (!at || !ua.token || !ub.token) throw new Error('auth setup failed');

  // Reset: archive whatever was auto-published at startup so advance() is deterministic
  const ct0 = await req('GET', '/daily-challenges/counts', undefined, at);
  const todayId = ct0.data?.today?.id;
  if (todayId) await req('POST', `/daily-challenges/${todayId}/archive`, {}, at);
  // Also clear any leftover QUEUE items (older than test markers) so the oldest-queue logic picks our markers
  const qList = await req('GET', '/daily-challenges?status=QUEUE&limit=100', {}, at);
  for (const item of qList.data?.items || []) {
    await req('POST', `/daily-challenges/${item.id}/archive`, {}, at).catch(() => {});
  }

  // 1. Create
  const c1 = await req('POST', '/daily-challenges', {
    question: `${MARK} Which language runs in the browser?`,
    optionA: 'JavaScript', optionB: 'Python', optionC: 'Java', optionD: 'C++',
    correctAnswer: 'A', explanation: 'Browsers run JavaScript natively.',
    description: 'Aptitude fundamentals', topic: 'Web Basics', difficulty: 'EASY', tags: ['web', 'js'],
  }, at);
  const m1 = c1.data;
  check(1, 'admin creates queued challenge (preview fields echoed)', c1.status === 201 && m1?.status === 'QUEUE' && m1?.question.startsWith(MARK) && m1?.topic === 'Web Basics' && m1?.difficulty === 'EASY' && Array.isArray(m1?.tags) && m1?.publishedDate === null);

  const mk = (q: string, correct: string) => req('POST', '/daily-challenges', {
    question: `${MARK} ${q}`, optionA: 'A1', optionB: 'B1', optionC: 'C1', optionD: 'D1', correctAnswer: correct,
  }, at);
  const [c2, c3, c4] = await Promise.all([mk('Biggest planet?', 'A'), mk('Capital of Japan?', 'B'), mk('2+2?', 'B')]);
  const m2 = c2.data, m3 = c3.data, m4 = c4.data;
  check(2, 'multiple QUEUE challenges creatable', c2.status === 201 && c3.status === 201 && c4.status === 201);

  // 3. Duplicate
  const d = await req('POST', `/daily-challenges/${m2.id}/duplicate`, {}, at);
  const dup = d.data;
  check(3, 'duplicate -> QUEUE "(Copy)"', d.status === 201 && dup?.status === 'QUEUE' && dup?.question.includes('(Copy)') && dup?.id !== m2.id);

  // 4. Update
  const u = await req('PUT', `/daily-challenges/${m1.id}`, {
    explanation: 'Updated exp', topic: 'Web Advanced', difficulty: 'HARD', tags: ['web', 'js', 'update'],
  }, at);
  check(4, 'update applies fields, status stays QUEUE', u.status === 200 && u.data?.topic === 'Web Advanced' && u.data?.difficulty === 'HARD' && u.data?.status === 'QUEUE');

  // 5. List + search + status filter + counts
  const l1 = await req('GET', `/daily-challenges?search=${MARK}&limit=100`, {}, at);
  check(5, 'list+search returns markers with counts', l1.status === 200 && l1.data?.total >= 4 && l1.data.items?.some((i: any) => i.id === m1.id) && typeof l1.data?.counts?.queue === 'number');
  const lq = await req('GET', '/daily-challenges?status=QUEUE&limit=100', {}, at);
  check(5, 'status filter QUEUE', lq.status === 200 && lq.data?.items.every((i: any) => i.status === 'QUEUE') && lq.data.items.some((i: any) => i.id === m1.id));

  // 6. Counts endpoint
  const ct = await req('GET', '/daily-challenges/counts', {}, at);
  check(6, 'counts endpoint shape', ct.status === 200 && typeof ct.data?.counts?.queue === 'number' && 'published' in ct.data.counts && 'archived' in ct.data.counts && 'today' in ct.data && ct.data.today?.published === false);

  // 7. Publish today -> oldest QUEUE (m1)
  const adv1 = await req('POST', '/daily-challenges/advance', {}, at);
  check(7, 'advance publishes oldest QUEUE (m1)', adv1.status === 200 && adv1.data?.published === true && adv1.data?.challenge?.id === m1.id);

  // 8. One per day (idempotent)
  const adv2 = await req('POST', '/daily-challenges/advance', {}, at);
  check(8, 'advance idempotent -> same challenge (one per day)', adv2.data?.challenge?.id === m1.id);

  // 9. Student today shows published with null attempt
  const t9 = await req('GET', '/daily-challenge/today', {}, ua.token);
  check(9, 'student /today returns published challenge + null attempt', t9.status === 200 && t9.data?.challenge?.id === m1.id && t9.data?.attempt === null);

  // 10. Submit correct (UA)
  const sA = await req('POST', `/daily-challenge/${m1.id}/submit`, { selectedAnswer: 'A' }, ua.token);
  const stA = await req('GET', '/daily-challenge/streak', {}, ua.token);
  check(10, 'correct submit -> isCorrect + answer/explanation', sA.status === 200 && sA.data?.attempt?.isCorrect === true && sA.data?.correctAnswer === 'A' && typeof sA.data?.explanation === 'string');
  check(10, 'streak 1 after first correct', stA.status === 200 && stA.data?.currentStreak === 1 && stA.data?.longestStreak === 1);

  // 11. Double submit rejected
  const dupSubmit = await req('POST', `/daily-challenge/${m1.id}/submit`, { selectedAnswer: 'B' }, ua.token);
  check(11, 'double submit rejected', dupSubmit.status === 400 && /already/i.test(dupSubmit.data?.message || ''));

  // 12. Invalid option rejected
  const invSubmit = await req('POST', `/daily-challenge/${m1.id}/submit`, { selectedAnswer: 'E' }, ub.token);
  check(12, 'invalid option rejected', invSubmit.status === 400 || invSubmit.status === 422);

  // 13. Wrong submit (UB) -> streak 0
  const sB = await req('POST', `/daily-challenge/${m1.id}/submit`, { selectedAnswer: 'D' }, ub.token);
  const stB = await req('GET', '/daily-challenge/streak', {}, ub.token);
  check(13, 'wrong submit -> isCorrect false', sB.status === 200 && sB.data?.attempt?.isCorrect === false);
  check(13, 'wrong submit -> streak 0', stB.status === 200 && stB.data?.currentStreak === 0);

  // 14. Advance future day -> publishes next (m2), old published auto-archived
  const advF = await req('POST', '/daily-challenges/advance', { date: localDate(2) }, at);
  const m1After = await req('GET', `/daily-challenges/${m1.id}`, {}, at);
  check(14, 'future advance publishes next + auto-archives previous', advF.status === 200 && advF.data?.challenge?.id === m2.id && m1After.data?.status === 'ARCHIVED');

  // 15. Future challenge not submittable
  const fut = await req('POST', `/daily-challenge/${m2.id}/submit`, { selectedAnswer: 'A' }, ua.token);
  check(15, 'future-published submit rejected', fut.status === 400);

  // 16. Queued challenge not submittable
  const qSub = await req('POST', `/daily-challenge/${m3.id}/submit`, { selectedAnswer: 'B' }, ub.token);
  check(16, 'QUEUE challenge submit rejected', qSub.status === 400);

  // 17. History
  const hist = await req('GET', '/daily-challenge/history', {}, ua.token);
  check(17, 'history returns attempts', hist.status === 200 && hist.data?.total >= 1 && Array.isArray(hist.data?.items) && hist.data?.items[0]?.challenge?.id === m1.id);

  // 18. Streak engine: consecutive increment, gap reset, longest preserved
  const us = await signupAndLogin('DC US', 'dc_us');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const threeDays = new Date(today); threeDays.setDate(threeDays.getDate() + 3);
  await prisma.userStreak.create({ data: { userId: us.userId, currentStreak: 3, longestStreak: 8, lastCompletedDate: yest } });
  await dailyChallengeService.updateStreak(us.userId, true, today);
  const inc = await prisma.userStreak.findUnique({ where: { userId: us.userId } });
  check(18, 'consecutive day increments (3->4), longest kept', inc?.currentStreak === 4 && inc?.longestStreak === 8);
  await dailyChallengeService.updateStreak(us.userId, true, threeDays);
  const gap = await prisma.userStreak.findUnique({ where: { userId: us.userId } });
  check(18, 'gap resets to 1, longest preserved', gap?.currentStreak === 1 && gap?.longestStreak === 8);
  const us2 = await signupAndLogin('DC US2', 'dc_us2');
  await prisma.userStreak.create({ data: { userId: us2.userId, currentStreak: 5, longestStreak: 9, lastCompletedDate: yest } });
  await dailyChallengeService.updateStreak(us2.userId, false, today);
  const wrong = await prisma.userStreak.findUnique({ where: { userId: us2.userId } });
  check(18, 'wrong answer sets streak 0', wrong?.currentStreak === 0 && wrong?.longestStreak === 9);

  // 19. Same-day credit: duplicates never double-count; correct-after-wrong on the same
  //     calendar day (e.g. same-day replaced challenge) must credit the day exactly once.
  const us3 = await signupAndLogin('DC US3', 'dc_us3');
  await dailyChallengeService.updateStreak(us3.userId, true, today);
  await dailyChallengeService.updateStreak(us3.userId, true, today);
  const once = await prisma.userStreak.findUnique({ where: { userId: us3.userId } });
  check(19, 'correct twice same day credits once (no double increment)', once?.currentStreak === 1 && once?.longestStreak === 1);
  const us4 = await signupAndLogin('DC US4', 'dc_us4');
  await prisma.userStreak.create({ data: { userId: us4.userId, currentStreak: 0, longestStreak: 3, lastCompletedDate: today } });
  await dailyChallengeService.updateStreak(us4.userId, true, today);
  const recovered = await prisma.userStreak.findUnique({ where: { userId: us4.userId } });
  check(19, 'correct answer after earlier wrong same day credits day (0 -> 1), longest kept', recovered?.currentStreak === 1 && recovered?.longestStreak === 3);
  const us5 = await signupAndLogin('DC US5', 'dc_us5');
  await dailyChallengeService.updateStreak(us5.userId, false, today);
  const wrongDay = await prisma.userStreak.findUnique({ where: { userId: us5.userId } });
  check(19, 'wrong answer first same day stays 0', wrongDay?.currentStreak === 0 && wrongDay?.longestStreak === 0);

  // cleanup marker challenges
  for (const id of [dup?.id, m2?.id, m3?.id, m4?.id]) if (id) await req('POST', `/daily-challenges/${id}/archive`, {}, at).catch(() => {});
}

main().catch((err: any) => console.error('FATAL', err.message));

const interval = setInterval(() => { }, 1000);
setTimeout(() => {
  clearInterval(interval);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} passed ===`);
  for (const f of results.filter((r) => !r.pass)) console.log(`  FAIL T${String(f.n).padStart(2, '0')} ${f.name}${f.detail ? ' | ' + f.detail : ''}`);
  prisma.$disconnect().then(() => process.exit(passed === results.length && results.length > 0 ? 0 : 1));
}, 15000);
