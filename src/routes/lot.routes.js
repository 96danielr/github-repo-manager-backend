import express from 'express';
import { 
  createLot, 
  getLots, 
  getLot, 
  updateLot, 
  deleteLot 
} from '../controllers/lot.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getLots)
  .post(createLot);

router.route('/:id')
  .get(getLot)
  .put(updateLot)
  .delete(deleteLot);

export default router;
