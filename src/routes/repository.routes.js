import { Router } from 'express';
import {
  getRepositories,
  searchRepositories,
  getRepositoryDetails,
} from '../controllers/repository.controller.js';
import { protect, requireGitHub } from '../middleware/auth.js';

const router = Router();

// All routes require authentication and GitHub connection
router.use(protect, requireGitHub);

router.get('/', getRepositories);
router.get('/search', searchRepositories);
router.get('/:owner/:repo', getRepositoryDetails);

export default router;
