import express from 'express';
import multer from 'multer';
import { getClientInfo, reportPayment, getReceiptPDF, getCompanyAccountsPublic } from '../controllers/public.controller.js';

const router = express.Router();

// Multer config for manual payment captures (images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed'), false);
    }
  },
});

router.get('/accounts/:companySlug', getCompanyAccountsPublic);
router.get('/:companySlug/client/:idNumber', getClientInfo);
router.post('/report-payment', upload.single('capture'), reportPayment);

// Dynamic dynamic receipt generation
router.get('/receipt/:quotaId', getReceiptPDF);

export default router;
