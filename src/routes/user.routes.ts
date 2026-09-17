import { Router } from 'express';
import { requireUser } from '../middlewares/require-auth.js';
import { deleteAccount } from '../controllers/auth.controller.js';

export const userRouter = Router();

// Endpoint DELETE /api/user/delete-account
userRouter.delete('/delete-account', requireUser, deleteAccount);
userRouter.delete('/account', requireUser, deleteAccount);
