import { z } from 'zod';

const contentSchema = z.string().trim().min(1, 'Comment cannot be empty').max(1000, 'Comment must be 1000 characters or less');

export const commentSchema = z.object({
  content: contentSchema,
});

export const updateCommentSchema = z.object({
  content: contentSchema,
});
