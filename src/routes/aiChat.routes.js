import express from 'express';
import { askAI } from '../controllers/aiChat.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

// Apply common middlewares
router.use(protect);
router.use(tenantMiddleware);
router.use(companyMiddleware);

/**
 * @route   POST /api/ai/ask
 * @desc    Ask a question about sales data using AI
 * @access  Private (Admins only)
 */
router.post('/ask', restrictTo('tenant_admin', 'company_admin', 'superadmin'), askAI);

export default router;
