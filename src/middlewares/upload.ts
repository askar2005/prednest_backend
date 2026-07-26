import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json'];

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const CATEGORY_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'categories');
if (!fs.existsSync(CATEGORY_UPLOAD_DIR)) fs.mkdirSync(CATEGORY_UPLOAD_DIR, { recursive: true });

const catStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CATEGORY_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `cat-${uuidv4()}${ext}`);
  },
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    console.log('[MULTER] fileFilter check:', { fieldname: file.fieldname, originalname: file.originalname, mimetype: file.mimetype, size: file.size });
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      console.log('[MULTER] Allowed:', file.mimetype);
      cb(null, true);
    } else {
      console.log('[MULTER] Rejected:', file.mimetype, 'not in', ALLOWED_TYPES);
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

export const uploadMiddleware = upload.single('file');

export const uploadCategoryImage = multer({
  storage: catStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  },
});
