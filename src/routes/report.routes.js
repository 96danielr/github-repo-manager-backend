import express from 'express';
import { getSalesReport, getCashFlowProjection } from '../controllers/report.controller.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);
router.use(companyMiddleware);

router.get('/sales', checkPermission(PERMISSIONS.REPORTES_VIEW), getSalesReport);
router.get('/projection', checkPermission(PERMISSIONS.REPORTES_VIEW), getCashFlowProjection);

export default router;
