import express from 'express';
import { 
  createLot, 
  getLots, 
  getLot, 
  updateLot, 
  deleteLot 
} from '../controllers/lot.controller.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

// All lot operations require company context
router.route('/')
  .get(companyMiddleware, getLots)
  .post(companyMiddleware, createLot);

router.route('/:id')
  .get(getLot)
  .put(updateLot)
  .delete(deleteLot);

export default router;
