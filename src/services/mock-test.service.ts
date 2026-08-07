import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

export type QuestionInput = {
  question: string;
  questionType?: string;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  correctOption?: string | null;
  correctOptions?: string[] | null;
  correctAnswer?: boolean | string | null;
  correctBoolean?: boolean | null;
  answer?: string | null;
  answerText?: string | null;
  alternatives?: string | null;
  keywords?: string | null;
  caseSensitive?: boolean;
  explanation?: string | null;
  marks?: number | null;
  negativeMarks?: number | null;
  topicId?: string | null;
};

export type MockTestInput = {
  title: string;
  description?: string | null;
  preparationCategoryId: string;
  topicId?: string | null;
  subjectId?: string | null;
  durationMinutes?: number | null;
  negativeMarking?: number | null;
  passingMarks?: number | null;
  difficulty?: string | null;
  featured?: boolean;
  shuffleOptions?: boolean;
  shuffleQuestions?: boolean;
  scheduledAt?: string | Date | null;
  publishStatus?: string | null;
  questions?: QuestionInput[] | null;
};

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

function normalizeBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    if (s === 'TRUE' || s === '1') return true;
    if (s === 'FALSE' || s === '0') return false;
  }
  return null;
}

function toLetters(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim().toUpperCase()).filter((x) => x.length === 1);
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim().toUpperCase()).filter((s) => s.length === 1);
  return [];
}

function acceptableAnswers(q: { answerText?: string | null; alternatives?: string | null; keywords?: string | null }): string[] {
  const list: string[] = [];
  if (q.answerText) list.push(q.answerText);
  if (q.alternatives) list.push(...q.alternatives.split(',').map((s) => s.trim()).filter(Boolean));
  if (!list.length && q.keywords) list.push(...q.keywords.split(',').map((s) => s.trim()).filter(Boolean));
  return list;
}

function norm(s: string, caseSensitive: boolean) {
  const t = String(s || '').trim();
  return caseSensitive ? t : t.toLowerCase();
}

export function scoreOneQuestion(
  q: { questionType: string; correctOption?: string | null; correctOptions?: string[]; correctBoolean?: boolean | null; answerText?: string | null; alternatives?: string | null; keywords?: string | null; caseSensitive?: boolean; marks?: number | null; negativeMarks?: number | null; trueFalse?: { correctAnswer: boolean } | null },
  answer: unknown,
): { answered: boolean; isCorrect: boolean } {
  const type = String(q.questionType || 'MCQ');
  const answered = answer !== undefined && answer !== null && String(answer).trim() !== '' && !(Array.isArray(answer) && answer.length === 0);
  if (!answered) return { answered: false, isCorrect: false };

  let isCorrect = false;
  switch (type) {
    case 'MCQ': {
      const a = String(answer).trim().toUpperCase();
      isCorrect = a.length === 1 && a === String(q.correctOption || '').toUpperCase();
      break;
    }
    case 'MULTIPLE_SELECT': {
      const chosen = toLetters(answer);
      const correct = (q.correctOptions || []).map((x) => String(x).toUpperCase()).filter(Boolean).sort();
      const sorted = chosen.sort();
      isCorrect = correct.length > 0 && sorted.length === correct.length && correct.every((c, i) => c === sorted[i]);
      break;
    }
    case 'TRUE_FALSE': {
      const a = normalizeBool(answer);
      const c = q.correctBoolean ?? q.trueFalse?.correctAnswer ?? null;
      isCorrect = a !== null && c !== null && a === c;
      break;
    }
    case 'SHORT_ANSWER':
    case 'FILL_BLANK': {
      const cs = !!q.caseSensitive;
      const ans = norm(String(answer), cs);
      const list = acceptableAnswers(q);
      isCorrect = list.some((x) => norm(x, cs) === ans);
      if (!isCorrect && q.keywords && type === 'SHORT_ANSWER') {
        const keys = q.keywords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        isCorrect = keys.some((k) => ans.includes(k));
      }
      break;
    }
    case 'NUMERICAL': {
      const a = parseFloat(String(answer).replace(/,/g, ''));
      const c = parseFloat(String(q.answerText || '').replace(/,/g, ''));
      isCorrect = Number.isFinite(a) && Number.isFinite(c) && Math.abs(a - c) <= 1e-6 * Math.max(1, Math.abs(c));
      break;
    }
    case 'PARAGRAPH':
    default:
      isCorrect = false;
  }
  return { answered: true, isCorrect };
}

export function buildQuestionData(q: QuestionInput, index: number, topicId?: string | null): Prisma.MockTestQuestionCreateWithoutMockTestInput {
  const type = String(q.questionType || 'MCQ').toUpperCase();
  const correctBoolean = q.correctBoolean ?? (typeof q.correctAnswer === 'boolean' ? q.correctAnswer : q.correctAnswer === 'true' ? true : q.correctAnswer === 'false' ? false : null);
  const answerText = q.answerText ?? q.answer ?? null;
  return {
    topic: q.topicId ?? topicId ? { connect: { id: (q.topicId ?? topicId) as string } } : undefined,
    question: String(q.question || '').trim(),
    questionType: type as any,
    optionA: q.optionA || null,
    optionB: q.optionB || null,
    optionC: q.optionC || null,
    optionD: q.optionD || null,
    correctOption: String(q.correctOption || '').toUpperCase() || null,
    correctOptions: type === 'MULTIPLE_SELECT' ? toLetters(q.correctOptions ?? (typeof q.correctOption === 'string' ? q.correctOption : null)) : [],
    correctBoolean,
    answerText,
    alternatives: q.alternatives || null,
    keywords: q.keywords || null,
    caseSensitive: !!q.caseSensitive,
    explanation: q.explanation || null,
    marks: Math.max(1, Math.round(q.marks ?? 1)),
    negativeMarks: Math.max(0, Number(q.negativeMarks) || 0),
    orderIndex: index,
    ...(type === 'SHORT_ANSWER' && answerText ? { shortAnswer: { create: { answer: answerText, keywords: q.keywords || null, explanation: q.explanation || null } } } : {}),
    ...(type === 'TRUE_FALSE' && correctBoolean !== null ? { trueFalse: { create: { correctAnswer: correctBoolean, explanation: q.explanation || null } } } : {}),
    ...(type === 'FILL_BLANK' && answerText ? { fillBlank: { create: { correctAnswer: answerText, alternatives: q.alternatives || null, explanation: q.explanation || null } } } : {}),
  };
}

function validatePublishQuestions(questions: Prisma.MockTestQuestionGetPayload<Record<string, never>>[] | { questionType: string; question?: string; marks?: number; optionA?: string | null; optionB?: string | null; optionC?: string | null; optionD?: string | null; correctOption?: string | null; correctOptions?: string[]; correctBoolean?: boolean | null; answerText?: string | null; alternatives?: string | null; keywords?: string | null }[]): string[] {
  const errors: string[] = [];
  if (questions.length === 0) {
    errors.push('Add at least one question before publishing');
    return errors;
  }
  questions.forEach((q, i) => {
    const n = i + 1;
    const label = `Q${n}`;
    const type = String(q.questionType || 'MCQ');
    if (!q.question || !String(q.question).trim()) errors.push(`${label}: question text is required`);
    if (!q.marks || q.marks <= 0) errors.push(`${label}: marks must be greater than 0`);
    if (type === 'MCQ' || type === 'MULTIPLE_SELECT') {
      const optionMap: Record<string, string> = {};
      for (const k of OPTION_KEYS) {
        const v = (q as any)[`option${k}`];
        if (v && String(v).trim()) optionMap[k] = String(v).trim();
      }
      if (Object.keys(optionMap).length < 2) errors.push(`${label}: provide at least two options`);
      const texts = Object.values(optionMap).map((v) => v.toLowerCase());
      if (new Set(texts).size !== texts.length) errors.push(`${label}: duplicate option texts found`);
      if (type === 'MCQ') {
        const c = String(q.correctOption || '').toUpperCase();
        if (!c || !optionMap[c]) errors.push(`${label}: correct answer must be one of the provided options`);
      } else {
        const c = toLetters(q.correctOptions);
        if (c.length === 0) errors.push(`${label}: select at least one correct answer`);
        if (c.some((x) => !optionMap[x])) errors.push(`${label}: correct answers must be among the provided options`);
      }
    }
    if (type === 'TRUE_FALSE') {
      const c = (q as any).correctBoolean ?? (q as any).trueFalse?.correctAnswer ?? null;
      if (c === null || c === undefined) errors.push(`${label}: select the correct answer (True/False)`);
    }
    if (type === 'SHORT_ANSWER' || type === 'FILL_BLANK') {
      const list = acceptableAnswers({ answerText: (q as any).answerText, alternatives: (q as any).alternatives, keywords: (q as any).keywords });
      if (list.length === 0) errors.push(`${label}: provide the correct answer`);
    }
    if (type === 'NUMERICAL') {
      const v = parseFloat(String((q as any).answerText || '').replace(/,/g, ''));
      if (!Number.isFinite(v)) errors.push(`${label}: provide a numeric correct answer`);
    }
  });
  return errors;
}

function questionInclude() {
  return { include: { shortAnswer: true, trueFalse: true, fillBlank: true } as const };
}

const QUESTION_WITH_ANSWERS_SELECT = {
  id: true,
  question: true,
  questionType: true,
  optionA: true,
  optionB: true,
  optionC: true,
  optionD: true,
  correctOption: true,
  correctOptions: true,
  correctBoolean: true,
  answerText: true,
  alternatives: true,
  keywords: true,
  caseSensitive: true,
  explanation: true,
  marks: true,
  negativeMarks: true,
  orderIndex: true,
  topicId: true,
};

const QUESTION_SAFE_SELECT = {
  id: true,
  question: true,
  questionType: true,
  optionA: true,
  optionB: true,
  optionC: true,
  optionD: true,
  marks: true,
  negativeMarks: true,
  orderIndex: true,
};

const TEST_SELECT = {
  id: true,
  title: true,
  description: true,
  durationMinutes: true,
  difficulty: true,
  negativeMarking: true,
  preparationCategoryId: true,
  publishStatus: true,
  subjectId: true,
  featured: true,
  passingMarks: true,
  shuffleOptions: true,
  shuffleQuestions: true,
  totalMarks: true,
  scheduledAt: true,
  topicId: true,
  createdAt: true,
  updatedAt: true,
};

export const mockTestService = {
  async list(params: { role: string; userId: string; search?: string; status?: string; categoryId?: string; topicId?: string; page?: number; limit?: number }) {
    const { role, userId, search, status, categoryId, topicId } = params;
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (role !== 'ADMIN') {
      where.publishStatus = 'PUBLISHED';
    } else {
      if (status) where.publishStatus = status;
    }
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (categoryId) where.preparationCategoryId = categoryId;
    if (topicId) where.topicId = topicId;

    const [items, total] = await Promise.all([
      prisma.mockTest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          ...TEST_SELECT,
          preparationCategory: { select: { id: true, name: true, slug: true } },
          topic: { select: { id: true, name: true } },
          _count: { select: { questions: true, results: true } },
          ...(role !== 'ADMIN' ? { results: { where: { userId }, select: { id: true, score: true, total: true, createdAt: true } } } : {}),
        },
      }),
      prisma.mockTest.count({ where }),
    ]);
    return {
      items: items.map((t: any) => {
        const { results, ...rest } = t;
        return role !== 'ADMIN'
          ? { ...rest, myAttempts: results?.length || 0, myBestScore: results?.length ? Math.max(...results.map((r: any) => r.score)) : null }
          : rest;
      }),
      total,
      page,
      limit,
    };
  },

  async counts() {
    const [total, drafts, published, archived] = await Promise.all([
      prisma.mockTest.count(),
      prisma.mockTest.count({ where: { publishStatus: 'DRAFT' } }),
      prisma.mockTest.count({ where: { publishStatus: 'PUBLISHED' } }),
      prisma.mockTest.count({ where: { publishStatus: 'ARCHIVED' } }),
    ]);
    return { total, drafts, published, archived };
  },

  async get(id: string) {
    const test = await prisma.mockTest.findUnique({
      where: { id },
      include: {
        questions: { ...questionInclude(), orderBy: { orderIndex: 'asc' } },
        preparationCategory: { select: { id: true, name: true, slug: true } },
        topic: { select: { id: true, name: true } },
        _count: { select: { questions: true, results: true } },
      },
    });
    if (!test) throw new AppError('Mock test not found', 404);
    return test;
  },

  async getForAttempt(id: string) {
    const test = await prisma.mockTest.findUnique({
      where: { id },
      select: {
        ...TEST_SELECT,
        preparationCategory: { select: { id: true, name: true, slug: true } },
        topic: { select: { id: true, name: true } },
        questions: { select: QUESTION_SAFE_SELECT, orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!test) throw new AppError('Mock test not found', 404);
    if (test.publishStatus === 'DRAFT') throw new AppError('This mock test is not available yet', 403);
    if (test.publishStatus !== 'PUBLISHED') throw new AppError('Mock test not found', 404);
    return test;
  },

  async create(input: MockTestInput) {
    const questions = input.questions || [];
    const totalMarks = questions.reduce((s, q) => s + Math.max(1, Math.round(q.marks ?? 1)), 0);
    const test = await prisma.mockTest.create({
      data: {
        title: input.title,
        description: input.description || '',
        preparationCategoryId: input.preparationCategoryId,
        topicId: input.topicId || null,
        subjectId: input.subjectId || null,
        durationMinutes: Math.max(1, Math.round(input.durationMinutes ?? 60)),
        negativeMarking: Math.max(0, Number(input.negativeMarking) || 0),
        passingMarks: Math.max(0, Math.round(input.passingMarks ?? 0)),
        difficulty: (input.difficulty || null) as any,
        featured: !!input.featured,
        shuffleOptions: input.shuffleOptions !== false,
        shuffleQuestions: input.shuffleQuestions !== false,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        publishStatus: (input.publishStatus || 'DRAFT') as any,
        totalMarks,
        questions: {
          create: questions.map((q, idx) => buildQuestionData(q, idx, input.topicId)),
        },
      },
      include: { questions: { ...questionInclude(), orderBy: { orderIndex: 'asc' } } },
    });
    return test;
  },

  async update(id: string, input: MockTestInput) {
    const existing = await prisma.mockTest.findUnique({ where: { id }, include: { _count: { select: { results: true } } } });
    if (!existing) throw new AppError('Mock test not found', 404);

    const questions = input.questions;
    if (questions && existing.publishStatus === 'PUBLISHED' && existing._count.results > 0) {
      throw new AppError('This test already has attempts. Unpublish it before editing questions.', 400);
    }

    const totalMarks = questions
      ? questions.reduce((s, q) => s + Math.max(1, Math.round(q.marks ?? 1)), 0)
      : existing.totalMarks;

    return prisma.$transaction(async (tx) => {
      if (questions) {
        await tx.mockTestQuestion.deleteMany({ where: { mockTestId: id } });
      }
      return tx.mockTest.update({
        where: { id },
        data: {
          title: questions ? input.title : input.title ?? existing.title,
          description: input.description !== undefined ? input.description || '' : existing.description,
          preparationCategoryId: input.preparationCategoryId ?? existing.preparationCategoryId,
          topicId: input.topicId !== undefined ? input.topicId : existing.topicId,
          subjectId: input.subjectId !== undefined ? input.subjectId : existing.subjectId,
          durationMinutes: input.durationMinutes !== undefined && input.durationMinutes !== null ? Math.max(1, Math.round(input.durationMinutes)) : existing.durationMinutes,
          negativeMarking: input.negativeMarking !== undefined && input.negativeMarking !== null ? Math.max(0, Number(input.negativeMarking)) : existing.negativeMarking,
          passingMarks: input.passingMarks !== undefined && input.passingMarks !== null ? Math.max(0, Math.round(input.passingMarks)) : existing.passingMarks,
          difficulty: input.difficulty !== undefined ? (input.difficulty || null) as any : existing.difficulty,
          featured: input.featured !== undefined ? input.featured : existing.featured,
          shuffleOptions: input.shuffleOptions !== undefined ? input.shuffleOptions : existing.shuffleOptions,
          shuffleQuestions: input.shuffleQuestions !== undefined ? input.shuffleQuestions : existing.shuffleQuestions,
          scheduledAt: input.scheduledAt !== undefined ? (input.scheduledAt ? new Date(input.scheduledAt) : null) : existing.scheduledAt,
          publishStatus: (input.publishStatus || existing.publishStatus) as any,
          totalMarks,
          ...(questions
            ? { questions: { create: questions.map((q, idx) => buildQuestionData(q, idx, input.topicId ?? existing.topicId)) } }
            : {}),
        },
        include: { questions: { ...questionInclude(), orderBy: { orderIndex: 'asc' } } },
      });
    });
  },

  async remove(id: string) {
    const existing = await prisma.mockTest.findUnique({ where: { id } });
    if (!existing) throw new AppError('Mock test not found', 404);
    await prisma.mockTest.delete({ where: { id } });
    return { deleted: true };
  },

  async duplicate(id: string) {
    const existing = await prisma.mockTest.findUnique({
      where: { id },
      include: {
        questions: { ...questionInclude(), orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!existing) throw new AppError('Mock test not found', 404);

    return prisma.mockTest.create({
      data: {
        title: `${existing.title} (Copy)`,
        description: existing.description,
        preparationCategoryId: existing.preparationCategoryId,
        topicId: existing.topicId,
        subjectId: existing.subjectId,
        durationMinutes: existing.durationMinutes,
        negativeMarking: existing.negativeMarking,
        passingMarks: existing.passingMarks,
        difficulty: existing.difficulty,
        featured: false,
        shuffleOptions: existing.shuffleOptions,
        shuffleQuestions: existing.shuffleQuestions,
        publishStatus: 'DRAFT',
        totalMarks: existing.totalMarks,
        questions: {
          create: existing.questions.map((q, idx) =>
            buildQuestionData(
              {
                question: q.question,
                questionType: q.questionType,
                optionA: q.optionA,
                optionB: q.optionB,
                optionC: q.optionC,
                optionD: q.optionD,
                correctOption: q.correctOption,
                correctOptions: q.correctOptions,
                correctBoolean: q.correctBoolean ?? q.trueFalse?.correctAnswer ?? null,
                answerText: q.answerText ?? q.shortAnswer?.answer ?? q.fillBlank?.correctAnswer ?? null,
                alternatives: q.alternatives ?? q.fillBlank?.alternatives ?? null,
                keywords: q.keywords ?? q.shortAnswer?.keywords ?? null,
                caseSensitive: q.caseSensitive,
                explanation: q.explanation,
                marks: q.marks,
                negativeMarks: q.negativeMarks,
                topicId: q.topicId,
              },
              idx,
              existing.topicId,
            ),
          ),
        },
      },
      include: { questions: { ...questionInclude(), orderBy: { orderIndex: 'asc' } } },
    });
  },

  async setPublishStatus(id: string, status: 'DRAFT' | 'PUBLISHED') {
    const existing = await prisma.mockTest.findUnique({
      where: { id },
      include: { questions: true },
    });
    if (!existing) throw new AppError('Mock test not found', 404);

    if (status === 'PUBLISHED') {
      const errors = validatePublishQuestions(existing.questions);
      if (errors.length) throw new AppError(errors.join('. '), 400);
      if (!existing.durationMinutes || existing.durationMinutes <= 0) throw new AppError('Set a valid duration before publishing', 400);
      if (!existing.totalMarks || existing.totalMarks <= 0) throw new AppError('Test has no marks. Add questions first.', 400);
    }
    const updated = await prisma.mockTest.update({ where: { id }, data: { publishStatus: status } });
    return updated;
  },

  async setArchived(id: string, archived: boolean) {
    const existing = await prisma.mockTest.findUnique({ where: { id } });
    if (!existing) throw new AppError('Mock test not found', 404);
    return prisma.mockTest.update({ where: { id }, data: { publishStatus: archived ? 'ARCHIVED' : 'DRAFT' } });
  },

  async submit(userId: string, mockTestId: string, answers: Record<string, unknown>, timeSpent?: number | null) {
    const test = await prisma.mockTest.findUnique({
      where: { id: mockTestId },
      include: { questions: { ...questionInclude(), orderBy: { orderIndex: 'asc' } } },
    });
    if (!test) throw new AppError('Mock test not found', 404);
    if (test.publishStatus === 'DRAFT') throw new AppError('This mock test is not available yet', 403);
    if (test.publishStatus !== 'PUBLISHED') throw new AppError('Mock test not found', 404);

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let pendingReview = 0;
    const records: Prisma.AnswerRecordUncheckedCreateWithoutResultInput[] = [];

    for (const q of test.questions) {
      const raw = answers ? answers[q.id] : undefined;
      const isParagraph = q.questionType === 'PARAGRAPH';
      const res = scoreOneQuestion(q, raw);

      let marksAwarded = 0;
      let isCorrect = false;
      let answered = false;

      if (!res.answered) {
        skippedCount += 1;
      } else {
        answered = true;
        if (isParagraph) {
          pendingReview += 1;
        } else if (res.isCorrect) {
          isCorrect = true;
          marksAwarded = q.marks || 1;
          correctCount += 1;
        } else {
          marksAwarded = -(q.negativeMarks || 0);
          wrongCount += 1;
        }
      }
      score += marksAwarded;

      const rawText = typeof raw === 'string' ? raw : '';
      records.push({
        mockTestQuestionId: q.id,
        selectedOption: (q.questionType === 'MCQ' || q.questionType === 'TRUE_FALSE') && answered ? rawText : null,
        selectedOptions: Array.isArray(raw) ? raw.map(String) : q.questionType === 'MULTIPLE_SELECT' && answered ? [rawText] : [],
        textAnswer: !['MCQ', 'MULTIPLE_SELECT', 'TRUE_FALSE'].includes(q.questionType) && answered ? rawText : null,
        booleanAnswer: q.questionType === 'TRUE_FALSE' && answered ? normalizeBool(rawText) : null,
        isCorrect,
        marksAwarded,
        timeTaken: timeSpent ?? null,
      });
    }

    const total = test.questions.reduce((s, q) => s + (q.marks || 1), 0);
    const finalScore = Math.max(0, score);
    const pct = total > 0 ? (finalScore / total) * 100 : 0;

    const { result, rank, percentile } = await prisma.$transaction(async (tx) => {
      const created = await tx.result.create({
        data: {
          userId,
          mockTestId,
          score: finalScore,
          total,
          correctCount,
          wrongCount,
          skippedCount,
          accuracy: total > 0 ? (correctCount / total) * 100 : 0,
          timeSpent: timeSpent ?? null,
          status: 'COMPLETED',
          answers: { create: records },
        },
      });
      const higher = await tx.result.count({ where: { mockTestId, score: { gt: finalScore } } });
      const all = await tx.result.count({ where: { mockTestId } });
      const computedRank = higher + 1;
      const computedPercentile = all > 0 ? Math.round(((all - computedRank + 1) / all) * 1000) / 10 : null;
      await tx.result.update({ where: { id: created.id }, data: { rank: computedRank, percentile: computedPercentile } });
      return { result: created, rank: computedRank, percentile: computedPercentile };
    });

    let progress = await prisma.progress.findUnique({ where: { userId } });
    if (!progress) {
      progress = await prisma.progress.create({ data: { userId } });
    }
    const totalAttempts = progress.testsCompleted + 1;
    await prisma.progress.update({
      where: { userId },
      data: {
        testsCompleted: totalAttempts,
        averageScore: ((progress.averageScore * progress.testsCompleted) + finalScore) / totalAttempts,
        accuracy: ((progress.accuracy * progress.testsCompleted) + pct) / totalAttempts,
      },
    });

    return {
      result: {
        id: result.id,
        score: finalScore,
        total,
        correctCount,
        wrongCount,
        skippedCount,
        pendingReview,
        percentage: Math.round(pct * 100) / 100,
        accuracy: total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0,
        rank,
        percentile,
        timeSpent: timeSpent ?? null,
      },
      passed: finalScore >= (test.passingMarks || 0),
    };
  },

  async getResult(userId: string, resultId: string) {
    const result = await prisma.result.findFirst({
      where: { id: resultId, userId },
      include: {
        mockTest: {
          select: { ...TEST_SELECT, preparationCategory: { select: { id: true, name: true } }, topic: { select: { id: true, name: true } } },
        },
        answers: {
          include: {
            question: {
              select: {
                ...QUESTION_WITH_ANSWERS_SELECT,
                shortAnswer: true,
                trueFalse: true,
                fillBlank: true,
              },
            },
          },
        },
      },
    });
    if (!result) throw new AppError('Result not found', 404);
    const answers = [...result.answers].sort((a, b) => a.question.orderIndex - b.question.orderIndex);
    const percentage = result.total > 0 ? (result.score / result.total) * 100 : 0;
    const pendingReview = answers.filter((a) => a.question.questionType === 'PARAGRAPH' && a.textAnswer).length;
    return {
      ...result,
      answers,
      pendingReview,
      percentage: Math.round(percentage * 100) / 100,
      passed: result.score >= (result.mockTest.passingMarks || 0),
    };
  },

  async getResults(userId: string, mockTestId?: string) {
    const where: any = { userId };
    if (mockTestId) where.mockTestId = mockTestId;
    const items = await prisma.result.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        mockTest: {
          select: {
            id: true,
            title: true,
            description: true,
            durationMinutes: true,
            passingMarks: true,
            totalMarks: true,
            preparationCategory: { select: { id: true, name: true } },
          },
        },
        _count: { select: { answers: true } },
      },
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        score: r.score,
        total: r.total,
        percentage: r.total > 0 ? Math.round((r.score / r.total) * 10000) / 100 : 0,
        accuracy: r.accuracy,
        correctCount: r.correctCount,
        wrongCount: r.wrongCount,
        skippedCount: r.skippedCount,
        rank: r.rank,
        percentile: r.percentile,
        timeSpent: r.timeSpent,
        status: r.status,
        createdAt: r.createdAt,
        mockTest: r.mockTest,
      })),
      total: items.length,
    };
  },
};
