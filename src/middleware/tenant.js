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

    if (!tenantId) {
      return next(new AppError('No tenant context found', 403));
    }

    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return next(new AppError('Tenant not found', 404));
    }

    if (tenant.status === 'suspended') {
      return next(new AppError('Tenant account is suspended', 403));
    }

    req.tenant = {
      id: tenant._id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      role: role,       // user's role within this tenant
      userId: userId,   // user's membership ID in this tenant
      isTenantAdmin: role === 'tenant_admin',
    };

    next();
  } catch (error) {
    next(error);
  }
};
