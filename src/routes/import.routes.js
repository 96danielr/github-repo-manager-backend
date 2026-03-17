import express from 'express';
import multer from 'multer';
import { importExcel, exportExcel } from '../controllers/import.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'), false);
    }
  },
});

// Route for Excel import
router.post('/excel', protect, upload.single('file'), importExcel);

// Route for Excel export
router.get('/export', protect, exportExcel);

export default router;
