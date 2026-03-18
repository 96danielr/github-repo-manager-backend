import AppError from '../utils/AppError.js';
import Tenant from '../models/Tenant.js';

/**
 * Tenant middleware — verifies the tenant from JWT is active.
 * Injects req.tenant = { id, name, plan, status }
 * Must be used AFTER protect middleware.
 */
export const tenantMiddleware = async (req, res, next) => {
  try {
    const { tenantId, role, userId } = req.user;

    // Check for tenant override if superadmin
    let targetTenantId = tenantId;
    
    if (role === 'superadmin') {
      // Look for tenantId in query or body (frontend might send it as companyId)
      const overrideId = req.query.tenantId || req.body.tenantId || req.query.companyId || req.body.companyId;
      if (overrideId) {
        targetTenantId = overrideId;
      }
    }

    if (!targetTenantId) {
      return next(new AppError('No tenant context found', 403));
    }

    const tenant = await Tenant.findById(targetTenantId);

    if (!tenant) {
      return next(new AppError('Tenant not found', 404));
    }

    if (tenant.status === 'suspended' && role !== 'superadmin') {
      return next(new AppError('Tenant account is suspended', 403));
    }

    req.tenant = {
      id: tenant._id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      role: role,       // user's role
      userId: userId,   // user's membership ID
      isTenantAdmin: role === 'tenant_admin' || role === 'superadmin',
    };

    next();
  } catch (error) {
    next(error);
  }
};
