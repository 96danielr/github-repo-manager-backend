import express from 'express';
import { getLimits, setLimit, getUsageStats } from '../controllers/limit.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

// Only admins can manage limits
router.use(restrictTo('superadmin', 'tenant_admin'));

router.get('/', getLimits);
router.post('/', setLimit);
router.get('/usage', getUsageStats);

export default router;
