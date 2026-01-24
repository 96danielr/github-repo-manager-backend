import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  refreshToken,
} from '../controllers/auth.controller.js';
import {
  initiateGitHubAuth,
  handleGitHubCallback,
  connectGitHub,
  disconnectGitHub,
} from '../controllers/github.controller.js';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import {
  registerValidation,
  loginValidation,
} from '../validators/auth.validators.js';

const router = Router();

// Auth routes
router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/refresh', refreshToken);

// GitHub OAuth routes
router.get('/github', initiateGitHubAuth);
router.get('/github/callback', handleGitHubCallback);
router.post('/github/connect', protect, connectGitHub);
router.delete('/github/disconnect', protect, disconnectGitHub);

export default router;
