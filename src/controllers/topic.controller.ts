import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';

export const topicController = {
  resolveTopic: async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const topic = await prisma.topic.findUnique({ where: { id: req.params.topicId as string } });
      if (!topic) throw new AppError('Topic not found', 404);
      (req as any).__topic = topic;
      next();
    } catch (e) { next(e); }
  },

  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topic = await prisma.topic.findUnique({
        where: { id: req.params.topicId as string },
        include: { _count: { select: { studyMaterials: true, mcqQuestions: true, videos: true } } },
      });
      if (!topic) throw new AppError('Topic not found', 404);
      res.json(topic);
    } catch (e) { next(e); }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: any = { ...req.body };
      if (data.name) data.slug = data.name.toLowerCase().replace(/\s+/g, '-');
      const topic = await prisma.topic.update({ where: { id: req.params.topicId as string }, data });
      res.json(topic);
    } catch (e) { next(e); }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.topic.delete({ where: { id: req.params.topicId as string } });
      res.status(204).send();
    } catch (e) { next(e); }
  },

  dashboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topicId = req.params.topicId as string;
      const [notesCount, pdfs, mcqs, videos, pyqs, mockTests, results, scores, bookmarks, newNotesCount] = await Promise.all([
        prisma.studyMaterial.count({ where: { topicId, type: 'NOTE' } }),
        prisma.studyMaterial.count({ where: { topicId, type: 'PDF' } }),
        prisma.mCQQuestion.count({ where: { topicId } }),
        prisma.video.count({ where: { topicId } }),
        prisma.previousYearQuestion.count({ where: { preparationCategory: { topics: { some: { id: topicId } } } } }),
        prisma.mockTest.count({ where: { preparationCategory: { topics: { some: { id: topicId } } } } }),
        prisma.result.count({ where: { mockTest: { preparationCategory: { topics: { some: { id: topicId } } } } } }),
        prisma.result.aggregate({ where: { mockTest: { preparationCategory: { topics: { some: { id: topicId } } } } }, _avg: { score: true }, _max: { score: true } }),
        prisma.bookmark.count({ where: { topicId } }),
        prisma.note.count({ where: { topicId } }),
      ]);
      const recentUploads = await prisma.studyMaterial.findMany({ where: { topicId }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, createdAt: true, type: true } });
      const recentMcqs = await prisma.mCQQuestion.findMany({ where: { topicId }, orderBy: { createdAt: 'desc' }, take: 5, select: { question: true, createdAt: true } });
      const recentVideos = await prisma.video.findMany({ where: { topicId }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, createdAt: true } });
      res.json({
        notes: notesCount + newNotesCount, pdfs, mcqs, videos, pyqs, mockTests,
        totalAttempts: results,
        averageScore: scores._avg.score || 0,
        highestScore: scores._max.score || 0,
        totalDownloads: 0,
        studentsViewed: 0,
        bookmarks,
        completionRate: 0,
        recentUploads, recentMcqs, recentVideos,
      });
    } catch (e) { next(e); }
  },

  notes: {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const [studyMats, newNotes] = await Promise.all([
          prisma.studyMaterial.findMany({ where: { topicId: req.params.topicId as string }, orderBy: { createdAt: 'desc' } }),
          prisma.note.findMany({ where: { topicId: req.params.topicId as string }, orderBy: { createdAt: 'desc' } }),
        ]);
        const items = [...newNotes, ...studyMats];
        res.json({ items, total: items.length });
      } catch (e) { next(e); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const catId = (req as any).__categoryId as string;
        const note = await prisma.studyMaterial.create({
          data: { preparationCategoryId: catId, topicId: req.params.topicId as string, title: req.body.title, type: req.body.type || 'NOTE', content: req.body.content || null, externalUrl: req.body.externalUrl || null, searchText: req.body.tags || null, fileSize: req.body.fileSize || null, tagsString: req.body.tagsString || null },
        });
        res.status(201).json(note);
      } catch (e) { next(e); }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const note = await prisma.studyMaterial.update({ where: { id: req.params.id as string }, data: req.body });
        res.json(note);
      } catch (e) { next(e); }
    },
    delete: async (req: Request, res: Response, next: NextFunction) => {
      try { await prisma.studyMaterial.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
    },
  },

  mcqs: {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const items = await prisma.mCQQuestion.findMany({ where: { topicId: req.params.topicId as string }, orderBy: { createdAt: 'desc' } });
        res.json({ items, total: items.length });
      } catch (e) { next(e); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const catId = (req as any).__categoryId as string;
        const mcq = await prisma.mCQQuestion.create({
          data: { preparationCategoryId: catId, topicId: req.params.topicId as string, question: req.body.question, optionA: req.body.optionA, optionB: req.body.optionB, optionC: req.body.optionC, optionD: req.body.optionD, correctOption: req.body.correctOption, explanation: req.body.explanation || null, difficulty: req.body.difficulty || null, isPublished: req.body.isPublished ?? false, tagsText: req.body.tags || null },
        });
        res.status(201).json(mcq);
      } catch (e) { next(e); }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mcq = await prisma.mCQQuestion.update({ where: { id: req.params.id as string }, data: req.body });
        res.json(mcq);
      } catch (e) { next(e); }
    },
    delete: async (req: Request, res: Response, next: NextFunction) => {
      try { await prisma.mCQQuestion.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
    },
    bulkCreate: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const catId = (req as any).__categoryId as string;
        const topicId = req.params.topicId as string;
        const created = [];
        for (const q of req.body.questions || []) {
          const mcq = await prisma.mCQQuestion.create({ data: { preparationCategoryId: catId, topicId, question: q.question, optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD, correctOption: q.correctOption, explanation: q.explanation || null, difficulty: q.difficulty || null, isPublished: q.isPublished ?? false } });
          created.push(mcq);
        }
        res.status(201).json({ items: created, count: created.length });
      } catch (e) { next(e); }
    },
    bulkDelete: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ids = req.body.ids as string[];
        if (!ids?.length) throw new AppError('ids required', 400);
        await prisma.mCQQuestion.deleteMany({ where: { id: { in: ids }, topicId: req.params.topicId as string } });
        res.json({ deleted: ids.length });
      } catch (e) { next(e); }
    },
  },

  videos: {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const items = await prisma.video.findMany({ where: { topicId: req.params.topicId as string }, orderBy: { createdAt: 'desc' } });
        res.json({ items, total: items.length });
      } catch (e) { next(e); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const catId = (req as any).__categoryId as string;
        const video = await prisma.video.create({ data: { preparationCategoryId: catId, topicId: req.params.topicId as string, title: req.body.title, youtubeUrl: req.body.youtubeUrl, description: req.body.description || null, thumbnail: req.body.thumbnail || null, duration: req.body.duration || null, tags: req.body.tags || null } });
        res.status(201).json(video);
      } catch (e) { next(e); }
    },
    delete: async (req: Request, res: Response, next: NextFunction) => {
      try { await prisma.video.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
    },
  },

  pyqs: {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const items = await prisma.previousYearQuestion.findMany({ where: { preparationCategory: { topics: { some: { id: req.params.topicId as string } } } }, orderBy: { year: 'desc' } });
        res.json({ items, total: items.length });
      } catch (e) { next(e); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const catId = (req as any).__categoryId as string;
        const pyq = await prisma.previousYearQuestion.create({ data: { preparationCategoryId: catId, year: req.body.year, title: req.body.title, pdfUrl: req.body.pdfUrl || null, description: req.body.description || null, tags: req.body.tags || null } });
        res.status(201).json(pyq);
      } catch (e) { next(e); }
    },
    delete: async (req: Request, res: Response, next: NextFunction) => {
      try { await prisma.previousYearQuestion.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
    },
  },

  mockTests: {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const items = await prisma.mockTest.findMany({ where: { preparationCategory: { topics: { some: { id: req.params.topicId as string } } } }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { questions: true, results: true } } } });
        res.json({ items, total: items.length });
      } catch (e) { next(e); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const catId = (req as any).__categoryId as string;
        const test = await prisma.mockTest.create({
          data: { preparationCategoryId: catId, title: req.body.title, description: req.body.description || '', durationMinutes: req.body.durationMinutes || 60, negativeMarking: req.body.negativeMarking || 0, passingMarks: req.body.passingMarks || 40, publishStatus: req.body.publishStatus || 'DRAFT' },
        });
        res.status(201).json({ ...test, _count: { questions: 0, results: 0 } });
      } catch (e) { next(e); }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const test = await prisma.mockTest.update({ where: { id: req.params.id as string }, data: req.body });
        res.json(test);
      } catch (e) { next(e); }
    },
    delete: async (req: Request, res: Response, next: NextFunction) => {
      try { await prisma.mockTest.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
    },
  },

  analytics: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topicId = req.params.topicId as string;
      const [results, scores, popularNotes, popularVideos] = await Promise.all([
        prisma.result.count({ where: { mockTest: { preparationCategory: { topics: { some: { id: topicId } } } } } }),
        prisma.result.aggregate({ where: { mockTest: { preparationCategory: { topics: { some: { id: topicId } } } } }, _avg: { score: true }, _max: { score: true } }),
        prisma.studyMaterial.findMany({ where: { topicId }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, createdAt: true, type: true } }),
        prisma.video.findMany({ where: { topicId }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, createdAt: true, views: true } }),
      ]);
      res.json({ totalAttempts: results, averageScore: scores._avg.score || 0, highestScore: scores._max.score || 0, popularNotes, popularVideos });
    } catch (e) { next(e); }
  },

  resources: {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const items = await prisma.studyMaterial.findMany({ where: { topicId: req.params.topicId as string, type: { in: ['CODE', 'PRACTICE', 'SOLUTION', 'IMAGE'] } }, orderBy: { createdAt: 'desc' } });
        res.json({ items, total: items.length });
      } catch (e) { next(e); }
    },
  },

  // MCQ Import endpoints
  mcqImport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catId = (req as any).__categoryId as string;
      const topicId = req.params.topicId as string;
      const file = req.file;
      if (!file) throw new AppError('No file uploaded', 400);

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      let rows: any[] = [];

      if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws);
      } else if (ext === 'csv') {
        const raw = file.buffer.toString('utf-8');
        rows = csvParse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
      } else if (ext === 'json') {
        rows = JSON.parse(file.buffer.toString('utf-8'));
        if (!Array.isArray(rows)) rows = [rows];
      } else {
        throw new AppError('Unsupported file format. Use .xlsx, .csv, or .json', 400);
      }

      const templateKeys = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption', 'explanation', 'difficulty'];
      const isValid = rows.length > 0 && templateKeys.some(k => k in rows[0]);
      if (!isValid) throw new AppError('Invalid format. Required: question, optionA-D, correctOption', 400);

      const result = { total: rows.length, created: 0, errors: [] as string[], duplicates: 0, warnings: [] as string[] };
      const existingQuestions = new Set((await prisma.mCQQuestion.findMany({ where: { topicId }, select: { question: true } })).map(q => q.question.toLowerCase().trim()));

      const createMany: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const qText = (r.question || '').trim();
        if (!qText) { result.errors.push(`Row ${i + 1}: Empty question`); continue; }
        if (existingQuestions.has(qText.toLowerCase())) { result.duplicates++; result.warnings.push(`Row ${i + 1}: Duplicate skipped`); continue; }

        createMany.push({
          preparationCategoryId: catId,
          topicId,
          question: qText,
          optionA: (r.optionA || '').trim(),
          optionB: (r.optionB || '').trim(),
          optionC: (r.optionC || '').trim(),
          optionD: (r.optionD || '').trim(),
          correctOption: (r.correctOption || 'A').trim().toUpperCase(),
          explanation: r.explanation || null,
          difficulty: (r.difficulty || '').toUpperCase() === 'EASY' ? 'EASY' : (r.difficulty || '').toUpperCase() === 'HARD' ? 'HARD' : (r.difficulty || '').toUpperCase() === 'MEDIUM' ? 'MEDIUM' : null,
        });
        existingQuestions.add(qText.toLowerCase());
      }

      if (createMany.length > 0) {
        await prisma.mCQQuestion.createMany({ data: createMany });
        result.created = createMany.length;
      }

      res.json(result);
    } catch (e) { next(e); }
  },

  mcqExport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topicId = req.params.topicId as string;
      const format = String(req.params.format || 'json').toLowerCase();
      const mcqs = await prisma.mCQQuestion.findMany({ where: { topicId }, orderBy: { createdAt: 'desc' } });

      const data = mcqs.map(m => ({ question: m.question, optionA: m.optionA, optionB: m.optionB, optionC: m.optionC, optionD: m.optionD, correctOption: m.correctOption, explanation: m.explanation || '', difficulty: m.difficulty || '' }));

      if (format === 'csv') {
        const header = 'question,optionA,optionB,optionC,optionD,correctOption,explanation,difficulty\n';
        const rows = data.map(r => `${[r.question, r.optionA, r.optionB, r.optionC, r.optionD, r.correctOption, r.explanation, r.difficulty].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')}`).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="mcqs.csv"');
        res.send(header + rows);
      } else if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'MCQs');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="mcqs.xlsx"');
        res.send(buf);
      } else {
        res.json({ items: data, total: data.length });
      }
    } catch (e) { next(e); }
  },

  // Mock Test with Questions
  createMockTestWithQuestions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catId = (req as any).__categoryId as string;
      const topicId = req.params.topicId as string;
      const { title, description, durationMinutes, passingMarks, negativeMarking, publishStatus, scheduledAt, questions } = req.body;

      const test = await prisma.mockTest.create({
        data: {
          preparationCategoryId: catId,
          topicId,
          title,
          description: description || '',
          durationMinutes: durationMinutes || 60,
          passingMarks: passingMarks || 40,
          negativeMarking: negativeMarking || 0,
          publishStatus: publishStatus || 'DRAFT',
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          questions: {
            create: (questions || []).map((q: any, idx: number) => ({
              topicId,
              question: q.question,
              questionType: q.questionType || 'MCQ',
              optionA: q.optionA || null,
              optionB: q.optionB || null,
              optionC: q.optionC || null,
              optionD: q.optionD || null,
              correctOption: q.correctOption || null,
              explanation: q.explanation || null,
              marks: q.marks || 1,
              negativeMarks: q.negativeMarks || 0,
              orderIndex: idx,
              ...(q.questionType === 'SHORT_ANSWER' ? { shortAnswer: { create: { answer: q.answer || '', keywords: q.keywords || null, explanation: q.explanation || null } } } : {}),
              ...(q.questionType === 'TRUE_FALSE' ? { trueFalse: { create: { correctAnswer: q.correctAnswer === true || q.correctAnswer === 'true', explanation: q.explanation || null } } } : {}),
              ...(q.questionType === 'FILL_BLANK' ? { fillBlank: { create: { correctAnswer: q.answer || '', alternatives: q.alternatives || null, explanation: q.explanation || null } } } : {}),
            })),
          },
        },
        include: { questions: { include: { shortAnswer: true, trueFalse: true, fillBlank: true }, orderBy: { orderIndex: 'asc' } }, _count: { select: { questions: true, results: true } } },
      });

      res.status(201).json({ ...test, _count: { questions: test.questions.length, results: 0 } });
    } catch (e) { next(e); }
  },

  addMockTestQuestions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mockTestId = req.params.id as string;
      const { questions } = req.body;
      if (!questions?.length) throw new AppError('Questions required', 400);

      const lastOrder = await prisma.mockTestQuestion.findFirst({ where: { mockTestId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } });
      let nextIdx = (lastOrder?.orderIndex ?? -1) + 1;

      const created = [];
      for (const q of questions) {
        const question = await prisma.mockTestQuestion.create({
          data: {
            mockTestId,
            question: q.question,
            questionType: q.questionType || 'MCQ',
            optionA: q.optionA || null,
            optionB: q.optionB || null,
            optionC: q.optionC || null,
            optionD: q.optionD || null,
            correctOption: q.correctOption || null,
            explanation: q.explanation || null,
            marks: q.marks || 1,
            negativeMarks: q.negativeMarks || 0,
            orderIndex: nextIdx++,
            ...(q.questionType === 'SHORT_ANSWER' ? { shortAnswer: { create: { answer: q.answer || '', keywords: q.keywords || null } } } : {}),
            ...(q.questionType === 'TRUE_FALSE' ? { trueFalse: { create: { correctAnswer: q.correctAnswer === true || q.correctAnswer === 'true' } } } : {}),
            ...(q.questionType === 'FILL_BLANK' ? { fillBlank: { create: { correctAnswer: q.answer || '', alternatives: q.alternatives || null } } } : {}),
          },
          include: { shortAnswer: true, trueFalse: true, fillBlank: true },
        });
        created.push(question);
      }

      // Update totalMarks
      const total = await prisma.mockTestQuestion.aggregate({ where: { mockTestId }, _sum: { marks: true } });
      await prisma.mockTest.update({ where: { id: mockTestId }, data: { totalMarks: total._sum.marks || 0 } });

      res.status(201).json({ items: created, count: created.length });
    } catch (e) { next(e); }
  },

  getMockTestWithQuestions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const test = await prisma.mockTest.findUnique({
        where: { id: req.params.id as string },
        include: {
          questions: { include: { shortAnswer: true, trueFalse: true, fillBlank: true }, orderBy: { orderIndex: 'asc' } },
          _count: { select: { questions: true, results: true } },
        },
      });
      if (!test) throw new AppError('Mock test not found', 404);
      res.json(test);
    } catch (e) { next(e); }
  },

  // Note version history
  noteVersions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const versions = await prisma.noteVersion.findMany({ where: { studyMaterialId: req.params.id as string }, orderBy: { versionNumber: 'desc' }, take: 20 });
      res.json({ items: versions, total: versions.length });
    } catch (e) { next(e); }
  },

  restoreNoteVersion: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = await prisma.noteVersion.findUnique({ where: { id: req.params.versionId as string } });
      if (!version) throw new AppError('Version not found', 404);
      const note = await prisma.studyMaterial.update({ where: { id: req.params.id as string }, data: { content: version.content } });
      res.json(note);
    } catch (e) { next(e); }
  },
};
