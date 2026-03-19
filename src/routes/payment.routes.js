import express from 'express';
import { getPayments, approvePayment, rejectPayment } from '../controllers/payment.controller.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

// All payment routes require auth and tenant context
router.use(protect);
router.use(tenantMiddleware);

// Company-scoped routes
router.get('/all', companyMiddleware, getPayments);
router.put('/:id/approve', companyMiddleware, approvePayment);
router.put('/:id/reject', companyMiddleware, rejectPayment);

export default router;
