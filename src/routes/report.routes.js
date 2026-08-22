import express from 'express';
import {
  getSalesReport,
  getCashFlowProjection,
  getAdvancedReports,
  getAdvisorReport,
  getLotsReport,
} from '../controllers/report.controller.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);
router.use(companyMiddleware);

/**
 * Matriz de acceso a informes (plan maestro):
 * - Gerencia / Contabilidad / Admins: todos los informes.
 * - Jefe de Cartera: exclusivamente el informe de Cartera (/advanced).
 * - Ejecutivo Comercial / Asesor: exclusivamente su informe de ventas personal (/sales y /advisors).
 * - Otros roles: sin acceso (REPORTES_VIEW los bloquea antes de llegar aquí).
 */
const REPORT_FULL_ROLES = ['superadmin', 'tenant_admin', 'company_admin', 'administrador', 'gerente', 'contador', 'auxiliar_contable'];
const SELLER_ROLES = ['ejecutivo_comercial', 'vendedor', 'agent'];

const restrictReportAccess = (req, res, next) => {
  const { role } = req.user;
  if (REPORT_FULL_ROLES.includes(role)) return next();

  const path = req.path;
  if (role === 'jefe_cartera') {
    if (path === '/advanced') return next();
    return res.status(403).json({ success: false, message: 'El Jefe de Cartera solo puede acceder al informe de cartera' });
  }

  if (SELLER_ROLES.includes(role)) {
    if (path === '/sales' || path === '/advisors') return next();
    return res.status(403).json({ success: false, message: 'El asesor solo puede acceder a su informe de ventas personal' });
  }

  return res.status(403).json({ success: false, message: 'Su rol no tiene acceso a informes' });
};

router.get('/sales', checkPermission(PERMISSIONS.REPORTES_VIEW), restrictReportAccess, getSalesReport);
router.get('/projection', checkPermission(PERMISSIONS.REPORTES_VIEW), restrictReportAccess, getCashFlowProjection);
router.get('/advanced', checkPermission(PERMISSIONS.REPORTES_VIEW), restrictReportAccess, getAdvancedReports);
router.get('/advisors', checkPermission(PERMISSIONS.REPORTES_VIEW), restrictReportAccess, getAdvisorReport);
router.get('/lots', checkPermission(PERMISSIONS.REPORTES_VIEW), restrictReportAccess, getLotsReport);

export default router;
