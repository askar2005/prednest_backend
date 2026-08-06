import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

export const studentController = {
  getBookmarks: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await prisma.bookmark.findMany({
        where: { userId: req.user!.id },
        include: {
          studyMaterial: { select: { id: true, title: true, type: true, externalUrl: true } },
          mcqQuestion: { select: { id: true, question: true } },
          mockTest: { select: { id: true, title: true } },
          topic: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  },

  toggleBookmark: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { resource, resourceId } = req.body as { resource: string; resourceId: string };
      if (!resource || !resourceId) throw new AppError('resource and resourceId required', 400);

      const fieldMap: Record<string, string> = {
        studyMaterial: 'studyMaterialId',
        mcqQuestion: 'mcqQuestionId',
        mockTest: 'mockTestId',
        topic: 'topicId',
        interviewQuestion: 'interviewQuestionId',
        notification: 'notificationId',
      };
      const field = fieldMap[resource];
      if (!field) throw new AppError('Invalid resource type', 400);

      const existing = await prisma.bookmark.findFirst({
        where: { userId: req.user!.id, [field]: resourceId },
      });

      if (existing) {
        await prisma.bookmark.delete({ where: { id: existing.id } });
        return res.json({ bookmarked: false });
      }

      await prisma.bookmark.create({
        data: { userId: req.user!.id, [field]: resourceId },
      });
      res.json({ bookmarked: true });
    } catch (e) { next(e); }
  },

  getProgress: async (req: Request, res: Response, next: NextFunction) => {
    try {
      let progress = await prisma.progress.findUnique({ where: { userId: req.user!.id } });
      if (!progress) {
        progress = await prisma.progress.create({ data: { userId: req.user!.id } });
      }
      res.json(progress);
    } catch (e) { next(e); }
  },

  submitMcqAttempt: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mcqId, answer } = req.body as { mcqId: string; answer: string };
      if (!mcqId || !answer) throw new AppError('mcqId and answer required', 400);

      const mcq = await prisma.mCQQuestion.findUnique({ where: { id: mcqId } });
      if (!mcq) throw new AppError('MCQ not found', 404);

      const isCorrect = answer === mcq.correctOption;

      let progress = await prisma.progress.findUnique({ where: { userId: req.user!.id } });
      if (!progress) {
        progress = await prisma.progress.create({ data: { userId: req.user!.id } });
      }

      const totalAttempts = progress.testsCompleted + 1;
      const newAccuracy = ((progress.accuracy * progress.testsCompleted) + (isCorrect ? 100 : 0)) / totalAttempts;

      await prisma.progress.update({
        where: { userId: req.user!.id },
        data: { testsCompleted: totalAttempts, accuracy: newAccuracy },
      });

      res.json({ correct: isCorrect, correctOption: mcq.correctOption, explanation: mcq.explanation });
    } catch (e) { next(e); }
  },

  getMockTest: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const test = await prisma.mockTest.findUnique({
        where: { id },
        include: {
          questions: { orderBy: { orderIndex: 'asc' }, select: { id: true, question: true, optionA: true, optionB: true, optionC: true, optionD: true, marks: true, negativeMarks: true, orderIndex: true, questionType: true } },
          _count: { select: { questions: true } },
        },
      });
      if (!test) throw new AppError('Mock test not found', 404);
      // Never expose correctOption/explanation before a student submits.
      res.json(test);
    } catch (e) { next(e); }
  },

  submitMockTest: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mockTestId, answers } = req.body as { mockTestId: string; answers: Record<string, string> };
      if (!mockTestId || !answers) throw new AppError('mockTestId and answers required', 400);

      const test = await prisma.mockTest.findUnique({
        where: { id: mockTestId },
        include: { questions: true },
      });
      if (!test) throw new AppError('Mock test not found', 404);
      if (test.publishStatus !== 'PUBLISHED') throw new AppError('This mock test is not available yet', 403);

      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;
      const total = test.questions.length;
      const negativeMarking = test.negativeMarking || 0;

      for (const q of test.questions) {
        const userAnswer = answers[q.id];
        if (!userAnswer) { skippedCount += 1; continue; }
        if (userAnswer === q.correctOption) {
          score += q.marks;
          correctCount += 1;
        } else {
          score -= negativeMarking;
          wrongCount += 1;
        }
      }

      const result = await prisma.result.create({
        data: {
          userId: req.user!.id, mockTestId, score: Math.max(0, score), total,
          correctCount, wrongCount, skippedCount,
          accuracy: total > 0 ? (correctCount / total) * 100 : 0,
        },
      });

      let progress = await prisma.progress.findUnique({ where: { userId: req.user!.id } });
      if (!progress) {
        progress = await prisma.progress.create({ data: { userId: req.user!.id } });
      }

      const totalAttempts = progress.testsCompleted + 1;
      const pct = total > 0 ? (score / total) * 100 : 0;
      const avgScore = ((progress.averageScore * progress.testsCompleted) + score) / totalAttempts;
      const acc = ((progress.accuracy * progress.testsCompleted) + pct) / totalAttempts;

      await prisma.progress.update({
        where: { userId: req.user!.id },
        data: { testsCompleted: totalAttempts, averageScore: avgScore, accuracy: acc },
      });

      res.json({ result: { id: result.id, score: Math.max(0, score), total, correctCount, wrongCount, skippedCount, percentage: pct }, passed: score >= (test.passingMarks || 0) });
    } catch (e) { next(e); }
  },


};
