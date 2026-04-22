import express from 'express';
import { 
  getPortalSummary, 
  getMyLots, 
  getMyPayments 
} from '../controllers/portal.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

// All portal routes require authentication
router.use(protect);

// Ensure only clients can access these specific portal routes
// (Optional: but good for extra security)
router.use(restrictTo('cliente'));

// Apply tenant context if needed (usually tenantId is in the user object)
router.use(tenantMiddleware);

router.get('/summary', getPortalSummary);
router.get('/lots', getMyLots);
router.get('/payments', getMyPayments);

export default router;
