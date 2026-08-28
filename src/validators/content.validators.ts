import { z } from 'zod';

const emptyToNull = (value: unknown) => (value === '' ? null : value);
const nullableText = z.preprocess(emptyToNull, z.string().trim().min(1).nullable().optional());
const nullableUrl = z.preprocess(emptyToNull, z.string().url().nullable().optional());
const nullableDate = z.preprocess(emptyToNull, z.coerce.date().nullable().optional());

export const preparationCategorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  domain: z.string().min(2),
  description: z.string().optional().nullable(),
});

export const subjectSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().min(2),
});

export const topicSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional().nullable(),
});

export const studyMaterialSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  type: z.enum(['NOTE', 'PDF', 'IMAGE', 'VIDEO', 'CODE', 'PRACTICE', 'SOLUTION']),
  content: z.string().optional().nullable(),
  externalUrl: z.string().url().optional().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
  searchText: z.string().optional().nullable(),
});

export const mcqSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  topicId: z.string().uuid().optional().nullable(),
  question: z.string().min(2),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.string().min(1),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
});

export const mockTestSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  description: z.string().min(2),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
  durationMinutes: z.number().int().positive(),
  negativeMarking: z.number().nonnegative().optional(),
  publishStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const mockTestQuestionSchema = z.object({
  mockTestId: z.string().uuid(),
  topicId: z.string().uuid().optional().nullable(),
  mcqQuestionId: z.string().uuid().optional().nullable(),
  question: z.string().min(2),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.string().min(1),
  explanation: z.string().optional().nullable(),
  marks: z.number().int().positive().optional(),
  negativeMarks: z.number().nonnegative().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export const interviewQuestionSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  topicId: z.string().uuid().optional().nullable(),
  question: z.string().min(2),
  answer: z.string().min(2),
  sampleResponse: z.string().optional().nullable(),
  tips: z.string().optional().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
});

export const notificationSchema = z.object({
  preparationCategoryId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  summary: nullableText,
  description: nullableText,
  category: z.enum(['PLACEMENT_DRIVES', 'INTERNSHIPS', 'HACKATHONS', 'COMPANY_HIRING', 'EXAM_UPDATES', 'SCHOLARSHIPS', 'COLLEGE_ANNOUNCEMENTS', 'WORKSHOP', 'GENERAL']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  thumbnailUrl: nullableUrl,
  bannerUrl: nullableUrl,
  attachmentUrl: nullableUrl,
  externalLink: nullableUrl,
  publishDate: nullableDate,
  expiryDate: nullableDate,
  isPinned: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  targetAudience: nullableText,
  createdBy: nullableText,
  searchText: nullableText,
});

export const dailyChallengeSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  optionA: z.string().min(1, 'Option A is required'),
  optionB: z.string().min(1, 'Option B is required'),
  optionC: z.string().min(1, 'Option C is required'),
  optionD: z.string().min(1, 'Option D is required'),
  correctAnswer: z.enum(['A', 'B', 'C', 'D'], { message: 'Correct Answer must be A, B, C or D' }),
  explanation: z.string().nullish(),
  description: z.string().nullish(),
  topic: z.string().nullish(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).nullish(),
  tags: z.array(z.string()).max(20).nullish(),
});

export const dailyChallengeSubmitSchema = z.object({
  selectedAnswer: z.enum(['A', 'B', 'C', 'D'], { message: 'Selected answer must be A, B, C or D' }),
});

export const dailyChallengeUpdateSchema = dailyChallengeSchema.partial();

export const videoSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  youtubeUrl: z.string().url(),
  thumbnail: z.string().optional().nullable(),
  duration: z.number().int().nonnegative().optional().nullable(),
});

export const previousYearQuestionSchema = z.object({
  preparationCategoryId: z.string().uuid(),
  year: z.number().int().positive(),
  title: z.string().min(2),
  pdfUrl: z.string().optional().nullable(),
});
