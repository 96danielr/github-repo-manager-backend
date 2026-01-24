import { Router } from 'express';
import {
  getRepositories,
  searchRepositories,
  getRepositoryDetails,
  getRepoReadme,
  getRepoCommits,
  getRepoContributors,
} from '../controllers/repository.controller.js';
import { protect, requireGitHub } from '../middleware/auth.js';

const router = Router();

// All routes require authentication and GitHub connection
router.use(protect, requireGitHub);

router.get('/', getRepositories);
router.get('/search', searchRepositories);
router.get('/:owner/:repo', getRepositoryDetails);
router.get('/:owner/:repo/readme', getRepoReadme);
router.get('/:owner/:repo/commits', getRepoCommits);
router.get('/:owner/:repo/contributors', getRepoContributors);

export default router;
