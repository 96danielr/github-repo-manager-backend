import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  selectTenant,
  refreshTokenHandler,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import {
  registerValidation,
  loginValidation,
} from '../validators/auth.validators.js';

const router = Router();

// Public auth routes
router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/admin/login', loginValidation, validate, login); // alias for frontend compatibility
router.post('/select-tenant', selectTenant);
router.post('/refresh', refreshTokenHandler);

// Protected auth routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;
