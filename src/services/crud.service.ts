import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { parsePagination } from '../utils/pagination.js';

type ModelName = keyof typeof prisma;

const searchFields: Record<string, string[]> = {
  preparationCategory: ['name', 'slug', 'domain', 'description'],
  subject: ['name', 'slug'],
  topic: ['name', 'slug', 'description'],
  studyMaterial: ['title', 'content', 'searchText'],
  mcqQuestion: ['question', 'explanation'],
  mockTest: ['title', 'description'],
  mockTestQuestion: ['question', 'explanation'],
  interviewQuestion: ['question', 'answer', 'sampleResponse', 'tips'],
  notification: ['title', 'description', 'searchText'],
  userDailyChallenge: [],
  userStreak: [],
  bookmark: [],
  progress: [],
  user: ['name', 'email'],
};

const filterableFields = [
  'preparationCategoryId', 'subjectId', 'topicId',
  'mockTestId', 'mcqQuestionId', 'userId',
  'type', 'status', 'publishStatus',
] as const;

export function createCrudService(model: ModelName, options?: { include?: any }) {
  const delegate = (prisma as any)[model];

  return {
    async list(query: any) {
      const { skip, limit, page } = parsePagination(query);
      const fields = searchFields[model as string] ?? [];
      const where: any = {};
      if (query.q && fields.length) {
        where.OR = fields.map((field) => ({ [field]: { contains: query.q, mode: 'insensitive' } }));
      }
      for (const key of filterableFields) {
        if (query[key] !== undefined && query[key] !== '') {
          where[key] = query[key];
        }
      }
      const findOptions: any = {
        where,
        skip,
        take: limit,
        orderBy: query.sortBy ? { [query.sortBy]: query.sortDirection ?? 'desc' } : { createdAt: 'desc' },
      };
      if (options?.include) {
        findOptions.include = options.include;
      }
      const [items, total] = await Promise.all([
        delegate.findMany(findOptions),
        delegate.count({ where }),
      ]);
      return { items, page, limit, total };
    },
    async get(id: string) {
      const item = await delegate.findUnique({ where: { id } });
      if (!item) throw new AppError('Not found', 404);
      return item;
    },
    async create(data: any) {
      return delegate.create({ data });
    },
    async update(id: string, data: any) {
      await this.get(id);
      return delegate.update({ where: { id }, data });
    },
    async remove(id: string) {
      await this.get(id);
      return delegate.delete({ where: { id } });
    },
  };
}
