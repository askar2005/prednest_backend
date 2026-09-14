import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

export const studentController = {
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

};
