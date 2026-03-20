import express from 'express';
import {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanyPublic,
} from '../controllers/company.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

// Public routes
router.get('/public/:id', getCompanyPublic);

// All company routes require auth + tenant context
router.use(protect);
router.use(tenantMiddleware);

// Only tenant_admin can manage companies
router.get('/', getCompanies);
router.post('/', restrictTo('tenant_admin'), createCompany);
router.put('/:id', restrictTo('tenant_admin'), updateCompany);
router.delete('/:id', restrictTo('tenant_admin'), deleteCompany);

export default router;
