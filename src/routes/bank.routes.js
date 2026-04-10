import express from 'express';
import { 
  getBanks, 
  createBank, 
  updateBank, 
  deleteBank, 
  bulkCreateBanks,
  importBanksExcel,
} from '../controllers/bank.controller.js';
import multer from 'multer';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

// Publicly accessible bank listing (context resolved inside controller via query params)
router.get('/', getBanks);

// Management routes
router.use(protect, tenantMiddleware, companyMiddleware);

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', createBank);
router.post('/bulk', restrictTo('superadmin', 'tenant_admin', 'company_admin'), bulkCreateBanks);
router.post('/import', restrictTo('superadmin', 'tenant_admin', 'company_admin'), upload.single('file'), importBanksExcel);
router.put('/:id', updateBank);
router.delete('/:id', deleteBank);

export default router;
