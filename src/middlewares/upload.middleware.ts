import multer from 'multer';
import type { UploadCategory } from '../utils/file-validation.js';

// In-memory storage — buffers files in memory for streaming to Cloudinary
const storage = multer.memoryStorage();

export const multerUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB global max (per-category enforced in service)
  fileFilter: (_req, file, cb) => {
    cb(null, true); // Category-specific validation happens in upload service
  },
});

// Convenience: single file fields
export const singleFile = multerUpload.single('file');
export const singleImage = multerUpload.single('image');
export const singleCoverImage = multerUpload.single('coverImage');
export const singleProfileImage = multerUpload.single('profileImage');
export const singlePdf = multerUpload.single('pdf');

// Field-name to UploadCategory mapping
const FIELD_CATEGORY: Record<string, UploadCategory> = {
  file: 'general',
  image: 'images',
  coverImage: 'categories',
  profileImage: 'profile',
  pdf: 'notes',
};

export function getUploadCategoryForField(fieldname: string): UploadCategory {
  return FIELD_CATEGORY[fieldname] || 'general';
}
