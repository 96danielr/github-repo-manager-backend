import express from 'express';
import { getAuditLogs, getAuditMetadata } from '../controllers/audit.controller.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);
// Metadata doesn't strictly need companyId (it's tenant-scoped)
router.get('/metadata', checkPermission(PERMISSIONS.SYSTEM_AUDIT), getAuditMetadata);

router.use(companyMiddleware);

// Admins only (Tenant Admin or Company Admin with SYSTEM_AUDIT permission)
router.get('/', checkPermission(PERMISSIONS.SYSTEM_AUDIT), getAuditLogs);

export default router;
