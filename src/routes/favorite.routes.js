import { Router } from 'express';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
} from '../controllers/favorite.controller.js';
import { protect, requireGitHub } from '../middleware/auth.js';

const router = Router();

// All routes require authentication and GitHub connection
router.use(protect, requireGitHub);

router.get('/', getFavorites);
router.get('/:repoId/check', checkFavorite);
router.post('/:repoId', addFavorite);
router.delete('/:repoId', removeFavorite);

export default router;
