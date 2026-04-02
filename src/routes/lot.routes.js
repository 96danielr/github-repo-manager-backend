import express from 'express';
import { 
  createLot, 
  getLots, 
  getLot, 
  updateLot, 
  deleteLot,
  uploadLotImages,
  getLotsPublic,
  sellLot,
  getLotSaleDetail,
} from '../controllers/lot.controller.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Public route for catalog
router.get('/catalog/:companyId', getLotsPublic);

// Protected routes
router.use(protect);
router.use(tenantMiddleware);

// All lot operations require company context
router.route('/')
  .get(companyMiddleware, getLots)
  .post(companyMiddleware, createLot);

// Sale operation
router.post('/:id/sell', companyMiddleware, sellLot);

router.route('/:id')
  .get(getLot)
  .put(updateLot)
  .delete(deleteLot);

router.get('/:id/sale-detail', companyMiddleware, getLotSaleDetail);

// Image upload
router.post('/:id/images', upload.array('images', 5), uploadLotImages);

export default router;
