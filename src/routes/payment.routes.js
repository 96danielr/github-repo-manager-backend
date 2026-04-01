import express from 'express';
import multer from 'multer';
import { getPayments, approvePayment, rejectPayment, registerManualPayment } from '../controllers/payment.controller.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

// All payment routes require auth and tenant context
router.use(protect);
router.use(tenantMiddleware);

// Multer config for manual payment captures (images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Company-scoped routes
router.get('/all', companyMiddleware, getPayments);
router.post('/manual', companyMiddleware, upload.single('capture'), registerManualPayment);
router.put('/:id/approve', companyMiddleware, approvePayment);
router.put('/:id/reject', companyMiddleware, rejectPayment);

export default router;
