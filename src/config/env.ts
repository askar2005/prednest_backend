import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174,https://prepnest-admin.vercel.app,https://prepnest-user.vercel.app,https://prepnnest-admin.vercel.app,https://prepnnest-user.vercel.app,https://kathir-academy-admin.vercel.app,https://kathir-academy-user.vercel.app'),
  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.string().email().default('noreply@prepnest.com'),
  BREVO_SENDER_NAME: z.string().default('PrepNest Team'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);
export const hasCloudinary = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
