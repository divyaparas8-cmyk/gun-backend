import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/login', AuthController.login);
router.get('/me', authenticate, AuthController.getMe);
router.post('/logout', authenticate, AuthController.logout);
router.patch('/profile', authenticate, AuthController.updateProfile);
router.patch('/change-password', authenticate, AuthController.changePassword);

export default router;
