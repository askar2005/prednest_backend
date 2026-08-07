import { z } from 'zod';

export const questionInputSchema = z.object({
  question: z.string().min(1, 'Question text is required'),
  questionType: z.enum(['MCQ', 'MULTIPLE_SELECT', 'SHORT_ANSWER', 'TRUE_FALSE', 'FILL_BLANK', 'NUMERICAL', 'PARAGRAPH', 'CODING']).default('MCQ'),
  optionA: z.string().nullable().optional(),
  optionB: z.string().nullable().optional(),
  optionC: z.string().nullable().optional(),
  optionD: z.string().nullable().optional(),
  correctOption: z.string().nullable().optional(),
  correctOptions: z.array(z.string()).optional(),
  correctAnswer: z.union([z.boolean(), z.string()]).nullable().optional(),
  correctBoolean: z.boolean().nullable().optional(),
  answer: z.string().nullable().optional(),
  answerText: z.string().nullable().optional(),
  alternatives: z.string().nullable().optional(),
  keywords: z.string().nullable().optional(),
  caseSensitive: z.boolean().optional(),
  explanation: z.string().nullable().optional(),
  marks: z.number().int().positive().nullable().optional(),
  negativeMarks: z.number().min(0).nullable().optional(),
  topicId: z.string().uuid().nullable().optional(),
});

export const mockTestInputSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().nullable().optional(),
  preparationCategoryId: z.string().uuid('Invalid category'),
  topicId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  negativeMarking: z.number().min(0).nullable().optional(),
  passingMarks: z.number().int().min(0).nullable().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).nullable().optional(),
  featured: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  scheduledAt: z.union([z.string(), z.date()]).nullable().optional(),
  publishStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  questions: z.array(questionInputSchema).optional(),
});

export const mockTestUpdateSchema = mockTestInputSchema.partial().extend({
  title: z.string().min(2, 'Title must be at least 2 characters').optional(),
  preparationCategoryId: z.string().uuid().optional(),
});

export const publishSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED']),
});

export const mockTestSubmitSchema = z.object({
  mockTestId: z.string().uuid(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  timeSpent: z.number().int().min(0).nullable().optional(),
});
