import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE = process.env.MT_TEST_BASE || 'http://localhost:4000/api';
const results: Array<{ n: number; name: string; pass: boolean; detail?: string }> = [];

async function req(method: string, path: string, body: any = undefined, token = '') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = method !== 'GET' && body !== undefined;
  const res = await fetch(BASE + path, { method, headers, body: hasBody ? JSON.stringify(body) : undefined });
  let data: any = null;
  try { data = await res.json(); } catch { }
  return { status: res.status, data };
}

function check(n: number, name: string, pass: boolean, detail?: string) {
  results.push({ n, name, pass, detail });
  console.log(`T${String(n).padStart(2, '0')} ${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

async function signupAndLogin(name: string, tag: string) {
  const email = `${tag}_${Date.now()}@test.com`;
  const passwordHash = await bcrypt.hash('Test@123', 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, isVerified: true } });
  const login = await req('POST', '/auth/login', { email, password: 'Test@123' });
  return { token: login.data?.token, userId: user.id };
}

async function main() {
  // Idempotence
  await prisma.user.deleteMany({ where: { email: { startsWith: 'ds_' } } });
  const threads = await prisma.discussionThread.findMany({ where: { topic: { name: { startsWith: 'DS-TEST-' } } }, select: { id: true } });
  if (threads.length) await prisma.discussionThread.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });
  await prisma.topic.deleteMany({ where: { name: { startsWith: 'DS-TEST-' } } });

  const adminLogin = await req('POST', '/admin/login', { email: 'admin@prepnest.com', password: 'Test@123' });
  const at = adminLogin.data?.token;
  const ua = await signupAndLogin('DS UA', 'ds_ua');
  const ub = await signupAndLogin('DS UB', 'ds_ub');
  if (!at || !ua.token || !ub.token) throw new Error('auth setup failed');

  const cat = await prisma.preparationCategory.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!cat) throw new Error('no category');
  const mkTopic = async (name: string) => (await prisma.topic.create({ data: { name, slug: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, preparationCategoryId: cat.id } })).id;
  const t1 = await mkTopic('DS-TEST-Alpha');
  const t2 = await mkTopic('DS-TEST-Beta');

  // 1. Isolation: empty list, then comments on t1 only
  const empty = await req('GET', `/student/topics/${t2}/discussion`, undefined, ua.token);
  check(1, 'empty topic -> empty list', empty.status === 200 && empty.data?.items?.length === 0 && empty.data?.total === 0);

  // 2. Create comment (student)
  const c1 = await req('POST', `/student/topics/${t1}/discussion`, { content: 'Can someone explain time complexity?' }, ua.token);
  check(2, 'create comment 201 + author user', c1.status === 201 && c1.data?.content === 'Can someone explain time complexity?' && c1.data?.author?.type === 'user' && c1.data?.author?.name === 'DS UA' && c1.data?.replyCount === 0 && c1.data?.isEdited === false);

  // 3. Validation: empty + too long
  const bad1 = await req('POST', `/student/topics/${t1}/discussion`, { content: '   ' }, ua.token);
  check(3, 'whitespace-only rejected', bad1.status === 400);
  const bad2 = await req('POST', `/student/topics/${t1}/discussion`, { content: 'x'.repeat(1001) }, ua.token);
  check(3, '>1000 chars rejected', bad2.status === 400);

  // 4. Auth required
  const noAuth = await req('GET', `/student/topics/${t1}/discussion`);
  check(4, 'unauthenticated rejected', noAuth.status === 401);

  // 5. Reply (depth 1) + reply to reply (depth 2)
  const r1 = await req('POST', `/student/discussion/${c1.data.id}/reply`, { content: 'O(n log n) because merge sort divides recursively.' }, ub.token);
  check(5, 'reply to comment created depth-1', r1.status === 201 && r1.data?.parentId === c1.data.id && r1.data?.author?.type === 'user');
  const r2 = await req('POST', `/student/discussion/${r1.data.id}/reply`, { content: 'Thank you!' }, ua.token);
  check(5, 'reply to reply stays under root (depth-2 flatten)', r2.status === 201 && r2.data?.parentId === r1.data.id);

  // 6. Replies listing lazy-loads with depth + pagination
  const rl = await req('GET', `/student/discussion/${c1.data.id}/replies`, undefined, ua.token);
  check(6, 'replies list returns 2 with depths 1,2', rl.status === 200 && rl.data?.items?.length === 2 && rl.data?.items?.some((i: any) => i.depth === 1) && rl.data?.items?.some((i: any) => i.depth === 2) && rl.data?.total === 2);

  // 7. replyCount on comment includes both levels
  const list1 = await req('GET', `/student/topics/${t1}/discussion`, undefined, ua.token);
  const c1WithCount = list1.data?.items?.find((i: any) => i.id === c1.data.id);
  check(7, 'replyCount includes nested replies', list1.status === 200 && c1WithCount?.replyCount === 2);

  // 8. Topic isolation
  const listB = await req('GET', `/student/topics/${t2}/discussion`, undefined, ua.token);
  check(8, 'topic B does not leak topic A comments', listB.data?.items?.length === 0 && listB.data?.total === 0);

  // 9. Edit own comment
  const e1 = await req('PUT', `/student/discussion/${c1.data.id}`, { content: 'Can someone explain time complexity? (edited)' }, ua.token);
  check(9, 'edit own comment -> isEdited true', e1.status === 200 && e1.data?.isEdited === true && e1.data?.content === 'Can someone explain time complexity? (edited)');

  // 10. Permissions: cannot edit/delete others
  const e2 = await req('PUT', `/student/discussion/${c1.data.id}`, { content: 'hacked' }, ub.token);
  check(10, 'edit other user comment -> 403', e2.status === 403);
  const d2 = await req('DELETE', `/student/discussion/${c1.data.id}`, undefined, ub.token);
  check(10, 'delete other user comment -> 403', d2.status === 403);

  // 11. Delete own reply
  const d3 = await req('DELETE', `/student/discussion/${r2.data.id}`, undefined, ua.token);
  check(11, 'delete own reply -> success', d3.status === 200 && d3.data?.success === true);
  const rl2 = await req('GET', `/student/discussion/${c1.data.id}/replies`, undefined, ua.token);
  check(11, 'deleted reply gone from replies', rl2.data?.items?.length === 1);

  // 12. Admin comment + ADMIN badge (author type admin)
  const ac1 = await req('POST', `/admin/topics/${t1}/discussion`, { content: 'Correct. The recurrence is T(n)=2T(n/2)+O(n).' }, at);
  check(12, 'admin comment -> author type admin', ac1.status === 201 && ac1.data?.author?.type === 'admin' && !!ac1.data?.author?.name);

  // 13. Admin reply to any comment + edit own admin comment
  const ar1 = await req('POST', `/admin/discussion/${c1.data.id}/reply`, { content: 'Keep this thread on topic.' }, at);
  check(13, 'admin reply to user comment', ar1.status === 201 && ar1.data?.parentId === c1.data.id && ar1.data?.author?.type === 'admin');
  const ae1 = await req('PUT', `/admin/discussion/${ac1.data.id}`, { content: 'Correct recurrence (updated).' }, at);
  check(13, 'admin edits own comment', ae1.status === 200 && ae1.data?.isEdited === true);

  // 14. Admin cannot edit a user comment (edit-own rule) but CAN delete any
  const ae2 = await req('PUT', `/admin/discussion/${c1.data.id}`, { content: 'moderated rewrite' }, at);
  check(14, 'admin edit of user comment -> 403', ae2.status === 403);

  // 15. Moderate: delete ANY user comment (cascade removes its replies)
  const mod = await req('DELETE', `/admin/discussion/${c1.data.id}/moderate`, undefined, at);
  const listAfter = await req('GET', `/student/topics/${t1}/discussion`, undefined, ua.token);
  check(15, 'admin moderate deletes user comment + replies', mod.status === 200 && listAfter.data?.items?.every((i: any) => i.id !== c1.data.id) && listAfter.data?.items?.length === 1);

  // 16. Pagination: 25 comments -> 20 + 5
  const bulk = await prisma.discussionThread.findFirst({ where: { topic: { name: 'DS-TEST-Alpha' } } });
  const created: string[] = [];
  for (let i = 0; i < 25; i++) {
    const c = await prisma.discussionComment.create({ data: { threadId: bulk!.id, userId: ua.userId, content: `bulk ${i}` } });
    created.push(c.id);
  }
  const p1 = await req('GET', `/student/topics/${t1}/discussion?page=1&limit=20`, undefined, ua.token);
  const p2 = await req('GET', `/student/topics/${t1}/discussion?page=2&limit=20`, undefined, ua.token);
  check(16, 'page 1 = 20 items, page 2 = 6 items', p1.data?.items?.length === 20 && p1.data?.total === 26 && p2.data?.items?.length === 6);
  check(16, 'chronological order (oldest first)', p1.data?.items?.[0]?.content === 'Correct recurrence (updated).' && p1.data?.items?.[19]?.content === 'bulk 18' && p2.data?.items?.[0]?.content === 'bulk 19');

  // 17. Admin list endpoint works too
  const alist = await req('GET', `/admin/topics/${t1}/discussion?limit=5`, undefined, at);
  check(17, 'admin list endpoint', alist.status === 200 && Array.isArray(alist.data?.items) && alist.data?.items?.length === 5);

  // 18. Edit admin comment by user -> 403; delete admin comment by user -> 403
  const ueAdmin = await req('PUT', `/student/discussion/${ac1.data.id}`, { content: 'x' }, ua.token);
  check(18, 'user cannot edit admin comment -> 403', ueAdmin.status === 403);
  const udAdmin = await req('DELETE', `/student/discussion/${ac1.data.id}`, undefined, ua.token);
  check(18, 'user cannot delete admin comment -> 403', udAdmin.status === 403);

  // 19. Rate limit: 11 rapid posts from one user -> 11th rejected
  const us = await signupAndLogin('DS US', 'ds_us');
  const lim = await req('POST', `/student/topics/${t2}/discussion`, { content: 'x' }, us.token);
  let limited = false;
  for (let i = 0; i < 11; i++) {
    const r = await req('POST', `/student/topics/${t2}/discussion`, { content: `spam ${i}` }, us.token);
    if (r.status === 429) { limited = true; break; }
  }
  check(19, 'rate limit blocks 11th rapid post', lim.status === 201 && limited === true);

  // cleanup
  await prisma.discussionComment.deleteMany({ where: { threadId: bulk!.id } });
  await prisma.discussionThread.deleteMany({ where: { topic: { name: { startsWith: 'DS-TEST-' } } } });
  await prisma.topic.deleteMany({ where: { name: { startsWith: 'DS-TEST-' } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'ds_' } } });
}

main().catch((err: any) => console.error('FATAL', err.message));

const interval = setInterval(() => { }, 1000);
setTimeout(() => {
  clearInterval(interval);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} passed ===`);
  for (const f of results.filter((r) => !r.pass)) console.log(`  FAIL T${String(f.n).padStart(2, '0')} ${f.name}${f.detail ? ' | ' + f.detail : ''}`);
  prisma.$disconnect().then(() => process.exit(passed === results.length && results.length > 0 ? 0 : 1));
}, 20000);
