import AppError from '../utils/AppError.js';
import Company from '../models/Company.js';
import UserCompany from '../models/UserCompany.js';

/**
 * Company middleware — verifies access to a specific company.
 * Reads companyId from req.params.companyId, req.body.companyId, or req.query.companyId.
 * 
 * tenant_admin → verifies company belongs to their tenant.
 * company_admin / agent → verifies user_company assignment.
 * 
 * Injects req.tenant.companyId and req.tenant.companyRole.
 * Must be used AFTER protect + tenantMiddleware.
 */
export const companyMiddleware = async (req, res, next) => {
  try {
    const companyId = req.params.companyId || req.body.companyId || req.query.companyId;

    if (!companyId) {
      return next(new AppError('Company ID is required', 400));
    }

    const { id: tenantId, isTenantAdmin } = req.tenant;

    // Verify company exists and belongs to this tenant
    const company = await Company.findOne({
      _id: companyId,
      tenantId: tenantId,
      status: 'active',
    });

    if (!company) {
      return next(new AppError('Company not found or not accessible', 404));
    }

    if (isTenantAdmin) {
      // Tenant admins can access any company in their tenant
      req.tenant.companyId = company._id;
      req.tenant.companyRole = 'tenant_admin';
      return next();
    }

    // For other roles, verify user_company assignment
    const userCompany = await UserCompany.findOne({
      userId: req.tenant.userId,
      companyId: company._id,
      tenantId: tenantId,
    });

    if (!userCompany) {
      return next(new AppError('You do not have access to this company', 403));
    }

    req.tenant.companyId = company._id;
    req.tenant.companyRole = userCompany.role;

    next();
  } catch (error) {
    next(error);
  }
};
