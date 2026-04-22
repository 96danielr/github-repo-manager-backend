import express from 'express';
import multer from 'multer';
import { importExcel, exportExcel, downloadTemplate } from '../controllers/import.controller.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

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

// Route for Excel import (requires company context)
router.post('/excel', protect, checkPermission(PERMISSIONS.IMPORT_MANAGE), tenantMiddleware, upload.single('file'), companyMiddleware, importExcel);

// Route for Excel export (requires company context)
router.get('/export', protect, tenantMiddleware, companyMiddleware, exportExcel);

// Route for Excel template download (public)
router.get('/template', downloadTemplate);

export default router;
