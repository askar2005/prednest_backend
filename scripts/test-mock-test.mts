import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE = process.env.MT_TEST_BASE || 'http://localhost:4000/api';
const MARK = 'MT-';
const QUESTION_TYPE_LABEL: Record<string, string> = {
  MCQ: 'MCQ', MULTIPLE_SELECT: 'Multi-Select', TRUE_FALSE: 'True/False', SHORT_ANSWER: 'Short Answer',
  NUMERICAL: 'Numerical', FILL_BLANK: 'Fill Blank', PARAGRAPH: 'Paragraph', CODING: 'Coding',
};

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

async function signupAndLogin(name: string, tag: string) {
  const email = `${tag}_${Date.now()}@test.com`;
  const passwordHash = await bcrypt.hash('Test@123', 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, isVerified: true } });
  const login = await req('POST', '/auth/login', { email, password: 'Test@123' });
  return { token: login.data?.token, userId: user.id };
}

function fullQuestion(type: string, index: number) {
  const common: any = {
    question: `${MARK} ${QUESTION_TYPE_LABEL[type]} question ${index}?`,
    questionType: type,
    marks: type === 'MCQ' || type === 'MULTIPLE_SELECT' ? 2 : type === 'PARAGRAPH' ? 5 : 1,
    negativeMarks: type === 'MCQ' ? 0.5 : type === 'MULTIPLE_SELECT' ? 1 : 0.25,
    explanation: `${MARK} Explanation for ${type}`,
  };
  if (type === 'MCQ') {
    common.optionA = 'Alpha'; common.optionB = 'Beta'; common.optionC = 'Gamma'; common.optionD = 'Delta';
    common.correctOption = 'A';
  } else if (type === 'MULTIPLE_SELECT') {
    common.optionA = 'Alpha'; common.optionB = 'Beta'; common.optionC = 'Gamma'; common.optionD = 'Delta';
    common.correctOption = 'A';
    common.correctOptions = ['A', 'C'];
  } else if (type === 'TRUE_FALSE') {
    common.correctBoolean = true;
  } else if (type === 'SHORT_ANSWER') {
    common.answerText = 'FIFO';
    common.alternatives = 'First In First Out, First in First out';
    common.keywords = 'fifo, queue';
  } else if (type === 'NUMERICAL') {
    common.answerText = '3.14';
  } else if (type === 'FILL_BLANK') {
    common.answerText = 'RAM';
    common.alternatives = 'random access memory';
  } else if (type === 'PARAGRAPH') {
    // no correct data needed
  } else if (type === 'CODING') {
    common.answerText = 'function sum(a,b){return a+b;}';
  }
  return common;
}

async function main() {
  await prisma.mockTest.deleteMany({ where: { title: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'mt_' } } });

  const adminLogin = await req('POST', '/admin/login', { email: 'admin@prepnest.com', password: 'Test@123' });
  const at = adminLogin.data?.token;
  const ua = await signupAndLogin('MT UA', 'mt_ua');
  const ub = await signupAndLogin('MT UB', 'mt_ub');
  if (!at || !ua.token || !ub.token) throw new Error('auth setup failed');

  const cats = await prisma.preparationCategory.findMany({ take: 1 });
  const catId = cats[0].id;

  // ---- 1. Create full test with all 7 types ----
  const allTypes = ['MCQ', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERICAL', 'FILL_BLANK', 'PARAGRAPH'];
  const questions = allTypes.map((t, i) => fullQuestion(t, i));
  const c1 = await req('POST', '/mock-tests', {
    title: `${MARK} Full Suite Test`,
    description: `${MARK} description`,
    preparationCategoryId: catId,
    durationMinutes: 30,
    passingMarks: 5,
    negativeMarking: 1,
    difficulty: 'MEDIUM',
    questions,
  }, at);
  const full = c1.data;
  check(1, 'create test with all 7 question types -> 201', c1.status === 201 && full?.id && full?.questions?.length === 7, c1.status + ' ' + (c1.data?.message || ''));
  check(1, 'totalMarks computed = 13 (2+2+1+1+1+1+5)', full?.totalMarks === 13 && full?.questions?.reduce((s: number, q: any) => s + q.marks, 0) === 13, `totalMarks=${full?.totalMarks}`);
  check(1, 'questions ordered by orderIndex', full?.questions?.every((q: any, i: number) => q.orderIndex === i));
  check(1, 'short answer persisted answerText + child table', full?.questions?.[3]?.answerText === 'FIFO' && full?.questions?.[3]?.shortAnswer?.answer === 'FIFO');
  check(1, 'true/false persisted correctBoolean + child table', full?.questions?.[2]?.correctBoolean === true && full?.questions?.[2]?.trueFalse?.correctAnswer === true);
  check(1, 'multi-select persisted correctOptions', JSON.stringify(full?.questions?.[1]?.correctOptions) === JSON.stringify(['A', 'C']));
  check(1, 'paragraph stored without answer data', full?.questions?.[6]?.questionType === 'PARAGRAPH' && full?.questions?.[6]?.answerText === null);

  // ---- 2. Input validation ----
  const badTitle = await req('POST', '/mock-tests', { title: 'X', preparationCategoryId: catId }, at);
  check(2, 'title too short -> 400', badTitle.status === 400);
  const badType = await req('POST', '/mock-tests', { title: `${MARK} Bad Type`, preparationCategoryId: catId, questions: [{ question: 'q', questionType: 'ESSAY', marks: 1 }] }, at);
  check(2, 'invalid questionType -> 400', badType.status === 400);
  const badMarks = await req('POST', '/mock-tests', { title: `${MARK} Bad Marks`, preparationCategoryId: catId, questions: [{ question: 'q', marks: 0 }] }, at);
  check(2, 'marks 0 -> 400', badMarks.status === 400);
  const noAuth = await req('POST', '/mock-tests', { title: 'x', preparationCategoryId: catId });
  check(2, 'create without auth -> 401', noAuth.status === 401);
  const userForbid = await req('POST', '/mock-tests', { title: 'x', preparationCategoryId: catId }, ua.token);
  check(2, 'student cannot create -> 403', userForbid.status === 403);

  // ---- 3. Student cannot see drafts ----
  const listUser1 = await req('GET', '/mock-tests?search=' + MARK, {}, ua.token);
  check(3, 'student list hides DRAFT tests', listUser1.status === 200 && !listUser1.data?.items?.some((i: any) => i.id === full.id));

  // ---- 4. Publish validation ----
  const metaOnly = await req('POST', '/mock-tests', { title: `${MARK} Meta Only`, preparationCategoryId: catId, durationMinutes: 30 }, at);
  const pubEmpty = await req('POST', `/mock-tests/${metaOnly.data?.id}/publish`, { status: 'PUBLISHED' }, at);
  check(4, 'publish with no questions -> 400', pubEmpty.status === 400 && /question/i.test(pubEmpty.data?.message || ''));
  const dupOpt = await req('POST', '/mock-tests', {
    title: `${MARK} Dup Options`, preparationCategoryId: catId, durationMinutes: 30,
    questions: [{ question: 'dup?', questionType: 'MCQ', optionA: 'X', optionB: 'X', optionC: 'Y', optionD: 'Z', correctOption: 'A', marks: 1 }],
  }, at);
  const pubDup = await req('POST', `/mock-tests/${dupOpt.data?.id}/publish`, { status: 'PUBLISHED' }, at);
  check(4, 'publish with duplicate option texts -> 400', pubDup.status === 400 && /duplicate/i.test(pubDup.data?.message || ''));
  const badOpt = await req('POST', '/mock-tests', {
    title: `${MARK} Bad Correct`, preparationCategoryId: catId, durationMinutes: 30,
    questions: [{ question: 'c?', questionType: 'MCQ', optionA: 'X', optionB: 'Y', optionC: 'Z', optionD: 'W', correctOption: 'E', marks: 1 }],
  }, at);
  const pubBadOpt = await req('POST', `/mock-tests/${badOpt.data?.id}/publish`, { status: 'PUBLISHED' }, at);
  check(4, 'publish with correctOption not in options -> 400', pubBadOpt.status === 400 && /correct answer/.test(pubBadOpt.data?.message || ''));
  const tfNoAns = await req('POST', '/mock-tests', {
    title: `${MARK} TF No Answer`, preparationCategoryId: catId, durationMinutes: 30,
    questions: [{ question: 'tf?', questionType: 'TRUE_FALSE', marks: 1 }],
  }, at);
  const pubTf = await req('POST', `/mock-tests/${tfNoAns.data?.id}/publish`, { status: 'PUBLISHED' }, at);
  check(4, 'publish true/false without answer -> 400', pubTf.status === 400);
  const numBad = await req('POST', '/mock-tests', {
    title: `${MARK} Num Bad`, preparationCategoryId: catId, durationMinutes: 30,
    questions: [{ question: 'n?', questionType: 'NUMERICAL', answerText: 'not-a-number', marks: 1 }],
  }, at);
  const pubNum = await req('POST', `/mock-tests/${numBad.data?.id}/publish`, { status: 'PUBLISHED' }, at);
  check(4, 'publish numerical with non-numeric answer -> 400', pubNum.status === 400);

  // ---- 5. Publish valid test ----
  const pub = await req('POST', `/mock-tests/${full.id}/publish`, { status: 'PUBLISHED' }, at);
  check(5, 'publish valid test -> PUBLISHED', pub.status === 200 && pub.data?.publishStatus === 'PUBLISHED');

  // ---- 6. Student sees published test with attempts count ----
  const listUser2 = await req('GET', '/mock-tests?search=' + MARK + '+Full+Suite', {}, ua.token);
  const found = listUser2.data?.items?.find((i: any) => i.id === full.id);
  check(6, 'student list shows published test with meta', listUser2.status === 200 && found && found.title.includes('Full Suite') && found.durationMinutes === 30 && found.totalMarks === 13 && found.myAttempts === 0);

  // ---- 7. Scheduled-future test hidden + not attemptable ----
  const future = new Date(Date.now() + 86400000 * 2).toISOString();
  const sched = await req('POST', '/mock-tests', {
    title: `${MARK} Scheduled Future`, preparationCategoryId: catId, durationMinutes: 30, scheduledAt: future,
    questions: [{ question: 'future?', questionType: 'MCQ', optionA: 'A1', optionB: 'B1', optionC: 'C1', optionD: 'D1', correctOption: 'A', marks: 1 }],
  }, at);
  await req('POST', `/mock-tests/${sched.data?.id}/publish`, { status: 'PUBLISHED' }, at);
  const listUser3 = await req('GET', '/mock-tests?search=' + MARK, {}, ua.token);
  check(7, 'future-scheduled test hidden from students', listUser3.status === 200 && !listUser3.data?.items?.some((i: any) => i.id === sched.data?.id));
  const getSched = await req('GET', `/student/mock-tests/${sched.data?.id}`, {}, ua.token);
  check(7, 'future-scheduled test not attemptable -> 403', getSched.status === 403);
  const subSched = await req('POST', '/student/mock-tests/submit', { mockTestId: sched.data?.id, answers: {} }, ua.token);
  check(7, 'future-scheduled submit rejected -> 403', subSched.status === 403);

  // ---- 8. Attempt payload leaks no answers ----
  const attempt = await req('GET', `/student/mock-tests/${full.id}`, {}, ua.token);
  const aq = attempt.data?.questions || [];
  check(8, 'attempt payload has 7 questions', attempt.status === 200 && aq.length === 7);
  check(8, 'no answer data leaked', aq.every((q: any) => q.correctOption === undefined && q.correctOptions === undefined && q.correctBoolean === undefined && q.answerText === undefined && q.alternatives === undefined && q.keywords === undefined && q.shortAnswer === undefined && q.trueFalse === undefined && q.fillBlank === undefined));
  check(8, 'attempt payload has options + marks + explanation hidden?', aq[0]?.optionA === 'Alpha' && aq[0]?.marks === 2 && aq[0]?.explanation === undefined);

  // ---- 9. Submission + scoring (all types) ----
  const qid = (i: number) => aq[i].id;
  const answers: Record<string, any> = {};
  answers[qid(0)] = 'A';        // MCQ correct +2
  answers[qid(1)] = ['C', 'A']; // multi unordered correct +2
  answers[qid(2)] = 'TRUE';     // TF correct +1
  answers[qid(3)] = '  fifo ';  // short: trim + ignore case +2
  answers[qid(4)] = '3.140';    // numerical tolerance +1
  answers[qid(5)] = 'ram';      // fill blank ignore case +1
  answers[qid(6)] = 'My paragraph answer'; // paragraph: stored, manual review +0
  const sub = await req('POST', '/student/mock-tests/submit', { mockTestId: full.id, answers, timeSpent: 610 }, ua.token);
  const r = sub.data?.result;
  check(9, 'submit returns result summary', sub.status === 200 && r?.id && typeof r?.rank === 'number' && typeof r?.percentile === 'number');
  check(9, 'score = 8 (2+2+1+1+1+1+0)', r?.score === 8, `score=${r?.score}`);
  check(9, 'counts: 6 correct, 0 wrong, 0 skipped, 1 pending', r?.correctCount === 6 && r?.wrongCount === 0 && r?.skippedCount === 0 && r?.pendingReview === 1, JSON.stringify({ c: r?.correctCount, w: r?.wrongCount, s: r?.skippedCount, p: r?.pendingReview }));
  check(9, 'percentage 61.54, passed true', r?.percentage === 61.54 && sub.data?.passed === true, `pct=${r?.percentage} passed=${sub.data?.passed}`);

  // ---- 10. Second student wrong answers -> negative marking, rank ----
  const answers2: Record<string, any> = {};
  answers2[qid(0)] = 'B'; // wrong -0.5
  answers2[qid(1)] = ['A']; // wrong -1
  answers2[qid(2)] = 'FALSE'; // wrong -0.25
  answers2[qid(3)] = 'stack'; // wrong -0.25
  answers2[qid(4)] = '2.5'; // wrong -0.25
  // qid(5) unanswered -> skipped; qid(6) unanswered -> skipped
  const sub2 = await req('POST', '/student/mock-tests/submit', { mockTestId: full.id, answers: answers2, timeSpent: 300 }, ub.token);
  const r2 = sub2.data?.result;
  check(10, 'negative marking applied, score floored at 0', r2?.score === 0, `score=${r2?.score}`);
  check(10, 'counts: 0 correct, 5 wrong, 2 skipped', r2?.correctCount === 0 && r2?.wrongCount === 5 && r2?.skippedCount === 2);
  check(10, 'rank: UA=1, UB=2; percentile 100/50', r?.rank === 1 && r?.percentile === 100 && r2?.rank === 2 && r2?.percentile === 50, `ua rank=${r?.rank} ub rank=${r2?.rank}`);

  // ---- 11. Answer records written with per-type answers ----
  const recs = await prisma.answerRecord.findMany({ where: { resultId: r.id }, include: { question: true }, orderBy: { question: { orderIndex: 'asc' } } });
  const recs2 = await prisma.answerRecord.findMany({ where: { resultId: r2.id }, include: { question: true }, orderBy: { question: { orderIndex: 'asc' } } });
  check(11, '7 answer records created', recs.length === 7);
  check(11, 'MCQ record selectedOption=A', recs[0]?.selectedOption === 'A' && recs[0]?.isCorrect === true && recs[0]?.marksAwarded === 2);
  check(11, 'multi record selectedOptions=[C,A]', JSON.stringify([...recs[1].selectedOptions].sort()) === JSON.stringify(['A', 'C']));
  check(11, 'TF record booleanAnswer=true', recs[2]?.booleanAnswer === true);
  check(11, 'short record textAnswer trimmed', recs[3]?.textAnswer === '  fifo ' && recs[3]?.isCorrect === true);
  check(11, 'numerical record marks 1', recs[4]?.marksAwarded === 1);
  check(11, 'fill blank record correct', recs[5]?.isCorrect === true && recs[5]?.marksAwarded === 1);
  check(11, 'paragraph record stored, 0 marks, not counted wrong', recs[6]?.textAnswer === 'My paragraph answer' && recs[6]?.marksAwarded === 0 && recs[6]?.isCorrect === false);
  check(11, 'unanswered -> skipped records', recs2[5]?.selectedOption === null && recs2[5]?.textAnswer === null && recs2[6]?.textAnswer === null);

  // ---- 12. Result detail (review) ----
  const detail = await req('GET', `/student/mock-tests/results/${r.id}`, {}, ua.token);
  check(12, 'result detail has question answers for review', detail.status === 200 && detail.data?.answers?.length === 7 && detail.data?.answers[0]?.question?.correctOption === 'A' && detail.data?.answers[0]?.question?.explanation?.startsWith(MARK));
  check(12, 'answers sorted by question orderIndex', detail.data?.answers?.every((a: any, i: number) => a.question.orderIndex === i));
  check(12, 'result detail has pendingReview + percentage + passed', detail.data?.pendingReview === 1 && detail.data?.percentage === 61.54 && detail.data?.passed === true);

  // ---- 13. Results history ----
  const hist = await req('GET', '/student/mock-tests/results', {}, ua.token);
  check(13, 'history lists results with test info', hist.status === 200 && hist.data?.total === 1 && hist.data?.items[0]?.mockTest?.title.includes('Full Suite') && hist.data?.items[0]?.percentage === 61.54);

  // ---- 14. Progress updated ----
  const prog = await req('GET', '/student/progress', {}, ua.token);
  check(14, 'progress testsCompleted=1', prog.status === 200 && prog.data?.testsCompleted === 1);

  // ---- 15. DRAFT not attemptable ----
  const draftSub = await req('POST', '/student/mock-tests/submit', { mockTestId: metaOnly.data?.id, answers: {} }, ua.token);
  check(15, 'DRAFT submit -> 403', draftSub.status === 403);
  const getDraft = await req('GET', `/student/mock-tests/${metaOnly.data?.id}`, {}, ua.token);
  check(15, 'DRAFT student get -> 403', getDraft.status === 403);
  const notFound = await req('GET', '/student/mock-tests/00000000-0000-0000-0000-000000000000', {}, ua.token);
  check(15, 'unknown test -> 404', notFound.status === 404);

  // ---- 16. Admin edit metadata + block question edit when published with attempts ----
  const upd = await req('PUT', `/mock-tests/${full.id}`, { durationMinutes: 45, passingMarks: 10, title: `${MARK} Full Suite Test Updated` }, at);
  check(16, 'metadata update applies', upd.status === 200 && upd.data?.durationMinutes === 45 && upd.data?.passingMarks === 10);
  const blocked = await req('PUT', `/mock-tests/${full.id}`, { questions: [{ question: 'replaced?', marks: 1 }] }, at);
  check(16, 'question edit blocked when published with attempts -> 400', blocked.status === 400 && /Unpublish/i.test(blocked.data?.message || ''));

  // ---- 17. Unpublish -> student cannot attempt ----
  const unpub = await req('POST', `/mock-tests/${full.id}/publish`, { status: 'DRAFT' }, at);
  check(17, 'unpublish -> DRAFT', unpub.status === 200 && unpub.data?.publishStatus === 'DRAFT');
  const subAfterUnpub = await req('POST', '/student/mock-tests/submit', { mockTestId: full.id, answers: {} }, ua.token);
  check(17, 'submit after unpublish -> 403', subAfterUnpub.status === 403);

  // ---- 18. Republish + question edit blocked still; question edit on draft works ----
  await req('POST', `/mock-tests/${full.id}/publish`, { status: 'PUBLISHED' }, at);
  const editQ = await req('PUT', `/mock-tests/${full.id}`, { questions: allTypes.map((t, i) => fullQuestion(t, i)) }, at);
  check(18, 'question edit still blocked (published + attempts)', editQ.status === 400);
  await req('POST', `/mock-tests/${full.id}/publish`, { status: 'DRAFT' }, at);
  const editQ2 = await req('PUT', `/mock-tests/${full.id}`, { questions: allTypes.map((t, i) => fullQuestion(t, i)) }, at);
  check(18, 'question edit allowed when DRAFT -> replaced in order', editQ2.status === 200 && editQ2.data?.questions?.length === 7 && editQ2.data?.questions?.every((q: any, i: number) => q.orderIndex === i) && editQ2.data?.totalMarks === 13, `status=${editQ2.status} qlen=${editQ2.data?.questions?.length} total=${editQ2.data?.totalMarks} msg=${editQ2.data?.message}`);

  // ---- 19. Duplicate ----
  const dup = await req('POST', `/mock-tests/${full.id}/duplicate`, {}, at);
  const dupId = dup.data?.id;
  check(19, 'duplicate -> DRAFT copy with all questions + answers', dup.status === 201 && dupId && dup.data?.title.includes('(Copy)') && dup.data?.publishStatus === 'DRAFT' && dup.data?.questions?.length === 7 && dup.data?.questions?.[1]?.correctOptions?.length === 2 && dup.data?.questions?.[3]?.answerText === 'FIFO');

  // ---- 20. Archive / unarchive ----
  const arc = await req('POST', `/mock-tests/${full.id}/archive/archive`, {}, at);
  check(20, 'archive -> ARCHIVED', arc.status === 200 && arc.data?.publishStatus === 'ARCHIVED');
  const listUser4 = await req('GET', '/mock-tests?search=' + MARK + '+Full+Suite', {}, ua.token);
  check(20, 'archived hidden from students', !listUser4.data?.items?.some((i: any) => i.id === full.id));
  const unarc = await req('POST', `/mock-tests/${full.id}/archive/restore`, {}, at);
  check(20, 'restore -> DRAFT', unarc.status === 200 && unarc.data?.publishStatus === 'DRAFT');

  // ---- 21. Admin list filters + counts ----
  const adminList = await req('GET', `/mock-tests?search=${MARK}&status=DRAFT&limit=100`, {}, at);
  check(21, 'admin list status filter works', adminList.status === 200 && adminList.data?.items?.every((i: any) => i.publishStatus === 'DRAFT'));
  const counts = await req('GET', '/mock-tests/counts', {}, at);
  check(21, 'counts endpoint shape', counts.status === 200 && typeof counts.data?.drafts === 'number' && typeof counts.data?.published === 'number' && typeof counts.data?.archived === 'number');
  const catFilter = await req('GET', `/mock-tests?categoryId=${catId}&limit=100`, {}, at);
  check(21, 'category filter works', catFilter.status === 200 && catFilter.data?.items?.every((i: any) => i.preparationCategoryId === catId));

  // ---- 22. Legacy topic-scoped builder + list still work ----
  const topic = await prisma.topic.findFirst({ where: { preparationCategoryId: catId } });
  if (topic) {
    const leg = await req('POST', `/preparation/${cats[0].slug}/topics/${topic.id}/mock-tests/with-questions`, {
      title: `${MARK} Legacy Builder`, description: 'legacy', durationMinutes: 20, passingMarks: 2, negativeMarking: 0.5,
      questions: [
        { question: `${MARK} leg mcq?`, questionType: 'MCQ', optionA: 'A1', optionB: 'B1', optionC: 'C1', optionD: 'D1', correctOption: 'B', marks: 2 },
        { question: `${MARK} leg short?`, questionType: 'SHORT_ANSWER', answer: 'oxygen', marks: 1 },
        { question: `${MARK} leg tf?`, questionType: 'TRUE_FALSE', correctAnswer: true, marks: 1 },
        { question: `${MARK} leg fill?`, questionType: 'FILL_BLANK', answer: 'H2O', alternatives: 'water', marks: 1 },
      ],
    }, at);
    const legId = leg.data?.id;
    check(22, 'legacy builder creates test with types + totalMarks', leg.status === 201 && leg.data?.questions?.length === 4 && leg.data?.questions?.[1]?.answerText === 'oxygen' && leg.data?.questions?.[2]?.correctBoolean === true && leg.data?.questions?.[2]?.trueFalse?.correctAnswer === true && leg.data?.questions?.[3]?.fillBlank?.correctAnswer === 'H2O');
    const legAdmin = await req('GET', `/preparation/${cats[0].slug}/topics/${topic.id}/mock-tests/${legId}`, {}, at);
    check(22, 'legacy admin get returns full answers', legAdmin.status === 200 && legAdmin.data?.questions?.[0]?.correctOption === 'B');
    const legUser = await req('GET', `/preparation/${cats[0].slug}/topics/${topic.id}/mock-tests/${legId}`, {}, ua.token);
    check(22, 'legacy student get hides answers', legUser.status === 200 && legUser.data?.questions?.[0]?.correctOption === undefined);
    const legList = await req('GET', `/preparation/${cats[0].slug}/topics/${topic.id}/mock-tests`, {}, ua.token);
    check(22, 'legacy topic list for student filters DRAFT', legList.status === 200 && legList.data?.items?.every((i: any) => i.publishStatus === 'PUBLISHED'));
    const legPub = await req('POST', `/mock-tests/${legId}/publish`, { status: 'PUBLISHED' }, at);
    check(22, 'legacy test publishable via new endpoint', legPub.status === 200 && legPub.data?.publishStatus === 'PUBLISHED');
    const legSub = await req('POST', '/student/mock-tests/submit', { mockTestId: legId, answers: { [legUser.data.questions[1].id]: 'OXYGEN', [legUser.data.questions[2].id]: 'TRUE', [legUser.data.questions[3].id]: ' water ' } }, ua.token);
    check(22, 'legacy test scoring via new submit (short/TF/fill)', legSub.status === 200 && legSub.data?.result?.correctCount === 3 && legSub.data?.result?.score === 3, JSON.stringify(legSub.data?.result));
  }

  // ---- 23. Delete cascades ----
  const del = await req('DELETE', `/mock-tests/${dupId}`, {}, at);
  check(23, 'delete -> 204', del.status === 204);
  const delGone = await req('GET', `/mock-tests/${dupId}`, {}, at);
  check(23, 'deleted test not retrievable', delGone.status === 404);
  const orphans = await prisma.mockTestQuestion.count({ where: { mockTestId: dupId } });
  check(23, 'questions cascade-deleted', orphans === 0);

  // cleanup remaining marker tests
  const leftover = await prisma.mockTest.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } });
  for (const t of leftover) await prisma.mockTest.delete({ where: { id: t.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: 'mt_' } } }).catch(() => {});
}

main().catch((err: any) => console.error('FATAL', err.message));

const interval = setInterval(() => { }, 1000);
setTimeout(() => {
  clearInterval(interval);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} passed ===`);
  for (const f of results.filter((r) => !r.pass)) console.log(`  FAIL T${String(f.n).padStart(2, '0')} ${f.name}${f.detail ? ' | ' + f.detail : ''}`);
  prisma.$disconnect().then(() => process.exit(passed === results.length && results.length > 0 ? 0 : 1));
}, 30000);
