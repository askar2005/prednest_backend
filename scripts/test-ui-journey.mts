import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = process.env.MT_TEST_BASE || 'http://localhost:4000/api';

async function api(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data };
}

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const category = await prisma.preparationCategory.findFirst();
  if (!category) {
    console.log('NO CATEGORY IN DB — creating one...');
    const created = await prisma.preparationCategory.create({ data: { name: 'Audit Test', slug: `audit-${Date.now()}` } });
    console.log('created category', created.id);
  }
  const cat = await prisma.preparationCategory.findFirst({ select: { id: true } });
  if (!cat) throw new Error('no category');

  // 1. Admin login
  const adminLogin = await api('POST', '/admin/login', null, { email: 'admin@prepnest.com', password: 'Test@123' });
  check('admin login', adminLogin.status === 200);
  const adminToken = adminLogin.data?.token;

  // 2. Admin fetches categories (dropdown)
  const cats = await api('GET', '/preparation-categories', adminToken);
  check('admin GET /preparation-categories', cats.status === 200, `status=${cats.status}`);
  check('categories non-empty', (cats.data?.items?.length ?? 0) > 0, `count=${cats.data?.items?.length}`);

  // 3. Admin creates test with EXACT UI payload (questionPayload shape)
  const createPayload = {
    title: 'UI Audit Test',
    description: 'created via exact deployed-admin payload',
    preparationCategoryId: cat.id,
    durationMinutes: 30,
    passingMarks: 0,
    negativeMarking: 0,
    difficulty: 'MEDIUM',
    shuffleOptions: true,
    shuffleQuestions: true,
    questions: [
      {
        question: 'What is 2+2?',
        questionType: 'MCQ',
        optionA: '3', optionB: '4', optionC: '5', optionD: '6',
        correctOption: 'B',
        marks: 1, negativeMarks: 0,
        explanation: null,
      },
      {
        question: 'The sky is blue.',
        questionType: 'TRUE_FALSE',
        correctBoolean: true,
        marks: 2, negativeMarks: 0.5,
        explanation: 'Physics',
      },
    ],
  };
  const created = await api('POST', '/mock-tests', adminToken, createPayload);
  check('admin POST /mock-tests', created.status === 201, `status=${created.status} body=${JSON.stringify(created.data).slice(0, 200)}`);
  const testId = created.data?.id;
  check('created test has id', !!testId);

  // 4. Admin list — must include the new test
  const adminList = await api('GET', '/mock-tests?limit=100', adminToken);
  check('admin GET /mock-tests 200', adminList.status === 200);
  const listed = (adminList.data?.items || []).some((t: any) => t.id === testId);
  check('new test appears in admin list', listed, `total=${adminList.data?.total}`);

  // 5. Admin edit (update)
  const updated = await api('PUT', `/mock-tests/${testId}`, adminToken, { title: 'UI Audit Test EDITED', passingMarks: 10 });
  check('admin PUT /mock-tests/:id', updated.status === 200, `title=${updated.data?.title}`);
  const afterEdit = await api('GET', `/mock-tests/${testId}`, adminToken);
  check('edit persisted', afterEdit.data?.title === 'UI Audit Test EDITED');

  // 6. Publish
  const published = await api('POST', `/mock-tests/${testId}/publish`, adminToken, { status: 'PUBLISHED' });
  check('admin publish', published.status === 200, `status=${published.status} publishStatus=${published.data?.publishStatus}`);

  // 7. User list — must include it now
  const userLogin = await api('POST', '/auth/login', null, { email: 'user@prepnest.com', password: 'Test@123' });
  check('user login', userLogin.status === 200);
  const userToken = userLogin.data?.token;
  const userList = await api('GET', '/mock-tests?limit=100', userToken);
  check('user GET /mock-tests 200', userList.status === 200);
  const userSees = (userList.data?.items || []).some((t: any) => t.id === testId);
  check('published test appears for user', userSees, `user total=${userList.data?.total}`);

  // 8. User opens test (attempt)
  const attempt = await api('GET', `/student/mock-tests/${testId}`, userToken);
  check('user GET /student/mock-tests/:id 200', attempt.status === 200);
  const qs = attempt.data?.questions || [];
  check('attempt has 2 questions', qs.length === 2, `q=${qs.length}`);
  const leak = JSON.stringify(attempt.data).match(/correctOption|correctBoolean|answerText|explanation/);
  check('attempt payload does NOT leak answers', !leak);

  // 9. User submits
  const answers: Record<string, string> = {};
  qs.forEach((q: any) => {
    if (q.questionType === 'MCQ') answers[q.id] = q.id === qs[0].id ? 'B' : 'A';
    else answers[q.id] = 'true';
  });
  const submit = await api('POST', '/student/mock-tests/submit', userToken, { mockTestId: testId, answers, timeSpent: 120 });
  check('user submit 200', submit.status === 200, `status=${submit.status}`);
  const result = submit.data?.result;
  check('submit result wrapper present', !!result, JSON.stringify(submit.data).slice(0, 200));
  check('result has score', typeof result?.score === 'number');
  check('result has total', typeof result?.total === 'number');
  check('result correct >= 1 (MCQ correct + TF correct)', (result?.correctCount ?? 0) >= 1, `correct=${result?.correctCount} score=${result?.score}`);
  check('passed flag present', typeof submit.data?.passed === 'boolean');

  // 10. Results history + review
  const history = await api('GET', '/student/mock-tests/results', userToken);
  check('results history 200', history.status === 200);
  const inHistory = (history.data?.items || []).some((r: any) => r.mockTest?.id === testId);
  check('result in history', inHistory, `items=${history.data?.items?.length}`);
  const review = await api('GET', `/student/mock-tests/results/${result?.id}`, userToken);
  check('result review 200', review.status === 200, `status=${review.status}`);
  check('review has answers', (review.data?.answers?.length ?? 0) === 2, `answers=${review.data?.answers?.length}`);
  check('review includes explanation', (review.data?.answers || []).some((r: any) => r.question?.explanation), `has=${(review.data?.answers || []).some((r: any) => r.question?.explanation)}`);

  // 11. Unpublish -> user no longer sees it
  const unpub = await api('POST', `/mock-tests/${testId}/publish`, adminToken, { status: 'DRAFT' });
  check('admin unpublish', unpub.status === 200);
  const userList2 = await api('GET', '/mock-tests?limit=100', userToken);
  const userSees2 = (userList2.data?.items || []).some((t: any) => t.id === testId);
  check('unpublished test hidden from user', !userSees2);

  // 12. Archive -> admin list still shows it, status ARCHIVED
  const arc = await api('POST', `/mock-tests/${testId}/archive/archive`, adminToken);
  check('admin archive', arc.status === 200 && arc.data?.publishStatus === 'ARCHIVED', `publishStatus=${arc.data?.publishStatus}`);
  const adminList2 = await api('GET', '/mock-tests?limit=100', adminToken);
  const stillListed = (adminList2.data?.items || []).some((t: any) => t.id === testId);
  check('archived test still in admin list', stillListed);

  // 13. Restore -> back to DRAFT
  const rest = await api('POST', `/mock-tests/${testId}/archive/restore`, adminToken);
  check('admin restore', rest.status === 200 && rest.data?.publishStatus === 'DRAFT', `publishStatus=${rest.data?.publishStatus}`);

  // 14. Duplicate
  const dup = await api('POST', `/mock-tests/${testId}/duplicate`, adminToken);
  check('admin duplicate', dup.status === 201, `status=${dup.status}`);
  const dupId = dup.data?.id;
  check('duplicate has questions', (dup.data?.questions?.length ?? 0) === 2, `q=${dup.data?.questions?.length}`);

  // 15. Search
  const searchRes = await api('GET', '/mock-tests?search=EDITED&limit=100', adminToken);
  check('admin search finds edited title', (searchRes.data?.items || []).some((t: any) => t.id === testId));

  // 16. Counts
  const counts = await api('GET', '/mock-tests/counts', adminToken);
  check('counts 200', counts.status === 200, JSON.stringify(counts.data));

  // 17. Delete both
  const del = await api('DELETE', `/mock-tests/${testId}`, adminToken);
  check('admin delete 204', del.status === 204, `status=${del.status}`);
  const del2 = await api('DELETE', `/mock-tests/${dupId}`, adminToken);
  check('admin delete duplicate 204', del2.status === 204);
  const userList3 = await api('GET', '/mock-tests?limit=100', userToken);
  const gone = !(userList3.data?.items || []).some((t: any) => t.id === testId);
  check('deleted test gone everywhere', gone);

  // Cleanup category only if we created it
  if (process.env.AUDIT_CREATED_CATEGORY) {
    await prisma.preparationCategory.delete({ where: { id: process.env.AUDIT_CREATED_CATEGORY } });
  }

  console.log(process.exitCode ? '=== SOME CHECKS FAILED ===' : '=== ALL 27 CHECKS PASSED ===');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
