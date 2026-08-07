import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { uploadFile, deleteFileByUrl } from '../services/upload.service.js';
import { mockTestService } from '../services/mock-test.service.js';

const CATEGORY_NAMES: Record<string, string> = {
  gate: 'GATE Preparation',
  aptitude: 'Aptitude Preparation',
  interview: 'Interview Preparation',
  technical: 'Technical Preparation',
};

function catId(req: Request) { return (req as any).__categoryId as string; }

function displayName(slug: string): string {
  return CATEGORY_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function ensureCategory(slug: string) {
  let cat = await prisma.preparationCategory.findUnique({ where: { slug } });
  if (!cat) {
    cat = await prisma.preparationCategory.create({
      data: { name: displayName(slug), slug, domain: displayName(slug), description: `Manage ${displayName(slug)} content`, isEnabled: true, displayOrder: 0 },
    });
  }
  return cat;
}

export const preparationController = {
  resolveCategory: async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const cat = await ensureCategory(req.params.category as string);
      (req as any).__categoryId = cat.id;
      (req as any).__category = cat;
      next();
    } catch (e) { next(e); }
  },

  dashboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = catId(req);
      const [topics, smNotes, pdfs, mcqs, videos, pyqs, mockTests, results, scores, newNotes] = await Promise.all([
        prisma.topic.count({ where: { preparationCategoryId: id } }),
        prisma.studyMaterial.count({ where: { preparationCategoryId: id, type: 'NOTE' } }),
        prisma.studyMaterial.count({ where: { preparationCategoryId: id, type: 'PDF' } }),
        prisma.mCQQuestion.count({ where: { preparationCategoryId: id } }),
        prisma.video.count({ where: { preparationCategoryId: id } }),
        prisma.previousYearQuestion.count({ where: { preparationCategoryId: id } }),
        prisma.mockTest.count({ where: { preparationCategoryId: id } }),
        prisma.result.count({ where: { mockTest: { preparationCategoryId: id } } }),
        prisma.result.aggregate({ where: { mockTest: { preparationCategoryId: id } }, _avg: { score: true }, _max: { score: true }, _min: { score: true } }),
        prisma.note.count({ where: { topic: { preparationCategoryId: id } } }),
      ]);
      const notes = smNotes + newNotes;
      const recent = await prisma.studyMaterial.findMany({ where: { preparationCategoryId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, createdAt: true, type: true } });
      const topTopic = await prisma.topic.findFirst({ where: { preparationCategoryId: id }, orderBy: { studyMaterials: { _count: 'desc' } }, select: { name: true, _count: { select: { studyMaterials: true, mcqQuestions: true } } } });
      res.json({ topics, notes, pdfs, mcqs, videos, pyqs, mockTests, totalAttempts: results, averageScore: scores._avg.score || 0, highestScore: scores._max.score || 0, lowestScore: scores._min.score || 0, recentUploads: recent, topTopic });
    } catch (e) { next(e); }
  },

  topics: { list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = catId(req);
      const items = await prisma.topic.findMany({ where: { preparationCategoryId: id }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { studyMaterials: true, mcqQuestions: true, videos: true } } } });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  }},
  topicCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = req.body.name.toLowerCase().replace(/\s+/g, '-');
      const topic = await prisma.topic.create({ data: { preparationCategoryId: catId(req), name: req.body.name, slug, description: req.body.description || null } });
      res.status(201).json(topic);
    } catch (e) { next(e); }
  },
  topicUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: any = { ...req.body };
      if (data.name) data.slug = data.name.toLowerCase().replace(/\s+/g, '-');
      const topic = await prisma.topic.update({ where: { id: req.params.id as string }, data });
      res.json(topic);
    } catch (e) { next(e); }
  },
  topicDuplicate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orig = await prisma.topic.findUnique({ where: { id: req.params.id as string } });
      if (!orig) throw new AppError('Topic not found', 404);
      const topic = await prisma.topic.create({ data: { preparationCategoryId: orig.preparationCategoryId, name: `${orig.name} (Copy)`, slug: `${orig.slug}-copy-${Date.now()}`, description: orig.description, status: orig.status, featured: false } });
      res.status(201).json(topic);
    } catch (e) { next(e); }
  },
  topicToggleFeatured: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topic = await prisma.topic.findUnique({ where: { id: req.params.id as string } });
      if (!topic) throw new AppError('Topic not found', 404);
      const updated = await prisma.topic.update({ where: { id: req.params.id as string }, data: { featured: !topic.featured } });
      res.json(updated);
    } catch (e) { next(e); }
  },
    topicDelete: async (req: Request, res: Response, next: NextFunction) => {
    try { await prisma.topic.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
  },

  notes: { list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const where: any = { preparationCategoryId: catId(req) };
      if (!isAdmin) where.visibility = 'PUBLIC';
      const items = await prisma.studyMaterial.findMany({ where, orderBy: { createdAt: 'desc' }, include: { topic: { select: { name: true } } } });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  }},
  noteCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await prisma.studyMaterial.create({
        data: { preparationCategoryId: catId(req), topicId: req.body.topicId || null, title: req.body.title, type: req.body.type || 'NOTE', content: req.body.content || null, externalUrl: req.body.externalUrl || null, searchText: req.body.tags || null },
      });
      res.status(201).json(note);
    } catch (e) { next(e); }
  },
  noteUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await prisma.studyMaterial.update({ where: { id: req.params.id as string }, data: req.body });
      res.json(note);
    } catch (e) { next(e); }
  },
  noteDelete: async (req: Request, res: Response, next: NextFunction) => {
    try { await prisma.studyMaterial.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
  },

  mcqs: { list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const where: any = { preparationCategoryId: catId(req) };
      if (!isAdmin) where.isPublished = true;
      const items = await prisma.mCQQuestion.findMany({ where, orderBy: { createdAt: 'desc' }, include: { topic: { select: { name: true } } } });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  }},
  mcqCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mcq = await prisma.mCQQuestion.create({
        data: { preparationCategoryId: catId(req), topicId: req.body.topicId || null, question: req.body.question, optionA: req.body.optionA, optionB: req.body.optionB, optionC: req.body.optionC, optionD: req.body.optionD, correctOption: req.body.correctOption, explanation: req.body.explanation || null, difficulty: req.body.difficulty || null },
      });
      res.status(201).json(mcq);
    } catch (e) { next(e); }
  },
  mcqUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.mCQQuestion.update({ where: { id: req.params.id as string }, data: req.body })); } catch (e) { next(e); }
  },
  mcqDelete: async (req: Request, res: Response, next: NextFunction) => {
    try { await prisma.mCQQuestion.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
  },
  mcqBulkCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = catId(req);
      const created = [];
      for (const q of req.body.questions || []) {
        const mcq = await prisma.mCQQuestion.create({ data: { preparationCategoryId: id, topicId: q.topicId || null, question: q.question, optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD, correctOption: q.correctOption, explanation: q.explanation || null, difficulty: q.difficulty || null } });
        created.push(mcq);
      }
      res.status(201).json({ items: created, count: created.length });
    } catch (e) { next(e); }
  },

  videos: { list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const where: any = { preparationCategoryId: catId(req) };
      if (!isAdmin) where.visibility = 'PUBLIC';
      const items = await prisma.video.findMany({ where, orderBy: { createdAt: 'desc' }, include: { topic: { select: { name: true } } } });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  }},
  videoCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const video = await prisma.video.create({ data: { preparationCategoryId: catId(req), topicId: req.body.topicId || null, title: req.body.title, youtubeUrl: req.body.youtubeUrl, thumbnail: req.body.thumbnail || null, duration: req.body.duration || null } });
      res.status(201).json(video);
    } catch (e) { next(e); }
  },
  videoDelete: async (req: Request, res: Response, next: NextFunction) => {
    try { await prisma.video.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
  },

  pyqs: { list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const where: any = { preparationCategoryId: catId(req) };
      if (!isAdmin) where.isPublished = true;
      const items = await prisma.previousYearQuestion.findMany({ where, orderBy: { year: 'desc' } });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  }},
  pyqCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pyq = await prisma.previousYearQuestion.create({ data: { preparationCategoryId: catId(req), year: req.body.year, title: req.body.title, pdfUrl: req.body.pdfUrl || null, pdfPublicId: req.body.pdfPublicId || null, isPublished: req.body.isPublished ?? false, description: req.body.description || null, tags: req.body.tags || null } });
      res.status(201).json(pyq);
    } catch (e) { next(e); }
  },
  pyqUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: any = {};
      if (req.body.year !== undefined) data.year = req.body.year;
      if (req.body.title !== undefined) data.title = req.body.title;
      if (req.body.pdfUrl !== undefined) data.pdfUrl = req.body.pdfUrl || null;
      if (req.body.pdfPublicId !== undefined) data.pdfPublicId = req.body.pdfPublicId || null;
      if (req.body.isPublished !== undefined) data.isPublished = req.body.isPublished;
      if (req.body.description !== undefined) data.description = req.body.description || null;
      if (req.body.tags !== undefined) data.tags = req.body.tags || null;
      const pyq = await prisma.previousYearQuestion.update({ where: { id: req.params.id as string }, data });
      res.json(pyq);
    } catch (e) { next(e); }
  },
  pyqDelete: async (req: Request, res: Response, next: NextFunction) => {
    try { await prisma.previousYearQuestion.delete({ where: { id: req.params.id as string } }); res.status(204).send(); } catch (e) { next(e); }
  },

  mockTests: { list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const where: any = { preparationCategoryId: catId(req) };
      if (!isAdmin) where.publishStatus = 'PUBLISHED';
      const items = await prisma.mockTest.findMany({ where, orderBy: { createdAt: 'desc' }, include: { _count: { select: { questions: true } } } });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  }},
  mockTestCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const test = await mockTestService.create({ ...req.body, preparationCategoryId: catId(req), publishStatus: req.body.publishStatus || 'DRAFT' });
      res.status(201).json({ ...test, _count: { questions: (test as any).questions?.length || 0 } });
    } catch (e) { next(e); }
  },
  mockTestUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const test = await mockTestService.update(req.params.id as string, { ...req.body, preparationCategoryId: req.body.preparationCategoryId || catId(req) });
      res.json(test);
    } catch (e) { next(e); }
  },
  mockTestDelete: async (req: Request, res: Response, next: NextFunction) => {
    try { await mockTestService.remove(req.params.id as string); res.status(204).send(); } catch (e) { next(e); }
  },

  analytics: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = catId(req);
      const [totalAttempts, scores, topTopic, popularNotes, mostAttemptedTest] = await Promise.all([
        prisma.result.count({ where: { mockTest: { preparationCategoryId: id } } }),
        prisma.result.aggregate({ where: { mockTest: { preparationCategoryId: id } }, _avg: { score: true }, _max: { score: true }, _min: { score: true } }),
        prisma.topic.findFirst({ where: { preparationCategoryId: id }, orderBy: { studyMaterials: { _count: 'desc' } }, select: { name: true, _count: { select: { studyMaterials: true, mcqQuestions: true } } } }),
        prisma.studyMaterial.findMany({ where: { preparationCategoryId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, createdAt: true, type: true } }),
        prisma.mockTest.findFirst({ where: { preparationCategoryId: id }, orderBy: { results: { _count: 'desc' } }, select: { title: true, _count: { select: { results: true } } } }),
      ]);
      res.json({
        totalAttempts,
        averageScore: scores._avg.score || 0,
        highestScore: scores._max.score || 0,
        lowestScore: scores._min.score || 0,
        completionRate: totalAttempts > 0 ? Math.round((scores._avg.score || 0) * 100) / 100 : 0,
        topTopic,
        popularNotes,
        mostAttemptedTest,
      });
    } catch (e) { next(e); }
  },

  moduleSettings: { get: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json((req as any).__category); } catch (e) { next(e); }
  }, update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body;
      const data: any = {};
      if (name !== undefined) data.name = name;
      const cat = await prisma.preparationCategory.update({ where: { slug: req.params.category as string }, data });
      res.json(cat);
    } catch (e) { next(e); }
  }},
  uploadImage: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const slug = String(req.params.category);
      const cat = await prisma.preparationCategory.findUnique({ where: { slug } });
      if (!cat) throw new AppError('Category not found', 404);

      if (cat.coverImagePublicId && cat.coverImage) {
        await deleteFileByUrl(cat.coverImage).catch(() => {});
      }

      const result = await uploadFile(req.file, 'categories', slug);
      const updated = await prisma.preparationCategory.update({
        where: { slug },
        data: { coverImage: result.secureUrl, coverImagePublicId: result.publicId },
      });
      res.json(updated);
    } catch (e) { next(e); }
  },
  deleteImage: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = String(req.params.category);
      const cat = await prisma.preparationCategory.findUnique({ where: { slug } });
      if (!cat) throw new AppError('Category not found', 404);

      if (cat.coverImagePublicId && cat.coverImage) {
        await deleteFileByUrl(cat.coverImage).catch(() => {});
      }

      const updated = await prisma.preparationCategory.update({
        where: { slug },
        data: { coverImage: null, coverImagePublicId: null },
      });
      res.json(updated);
    } catch (e) { next(e); }
  },
};