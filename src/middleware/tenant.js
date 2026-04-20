import AppError from '../utils/AppError.js';
import Tenant from '../models/Tenant.js';
import Company from '../models/Company.js';

/**
 * Tenant middleware — verifies the tenant from JWT is active.
 * Injects req.tenant = { id, name, plan, status }
 * Must be used AFTER protect middleware.
 */
export const tenantMiddleware = async (req, res, next) => {
  try {
    const user = req.user || {};
    let targetTenantId = user.tenantId;

    // Support public access via companyId or tenantId overlap
    const cid = req.query.companyId || req.body.companyId;
    const tid = req.query.tenantId || req.body.tenantId;

    if (!user.role && (cid || tid)) {
      if (tid) {
        targetTenantId = tid;
      } else if (cid) {
        // Resolve tenant from company
        const company = await Company.findById(cid);
        if (company) targetTenantId = company.tenantId;
      }
    } else if (user.role === 'superadmin' && (cid || tid)) {
      // Superadmin override
      targetTenantId = tid || targetTenantId;
      if (cid && !tid) {
        const company = await Company.findById(cid);
        if (company) {
          targetTenantId = company.tenantId;
        } else {
          // If cid is not a company, check if it's a tenant
          const tenantFound = await Tenant.findById(cid);
          if (tenantFound) targetTenantId = tenantFound._id;
        }
      }
    }

    if (!targetTenantId) {
      return next(new AppError('No tenant context found', 403));
    }

    const tenant = await Tenant.findById(targetTenantId);

    if (!tenant) {
      return next(new AppError('Tenant not found', 404));
    }

    if (tenant.status === 'suspended' && user.role !== 'superadmin') {
      return next(new AppError('Tenant account is suspended', 403));
    }

    // Unify context into req.user
    req.user.tenantId = tenant._id;
    req.user.tenantName = tenant.name;
    req.user.tenantPlan = tenant.plan;
    req.user.isTenantAdmin = (user.role === 'tenant_admin' || user.role === 'superadmin');

    next();
  } catch (error) {
    next(error);
  }
};
