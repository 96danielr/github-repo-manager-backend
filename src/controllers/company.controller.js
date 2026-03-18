import Company from '../models/Company.js';
import AppError from '../utils/AppError.js';

/**
 * Get all companies for the current tenant.
 */
export const getCompanies = async (req, res, next) => {
  try {
    const { id: tenantId } = req.tenant;

    const companies = await Company.find({ tenantId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { companies },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new company within the tenant.
 */
export const createCompany = async (req, res, next) => {
  try {
    const { name, rfc } = req.body;
    const { id: tenantId } = req.tenant;

    if (!name) {
      return next(new AppError('Company name is required', 400));
    }

    const company = await Company.create({
      tenantId,
      name,
      rfc,
    });

    res.status(201).json({
      success: true,
      data: { company },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a company.
 */
export const updateCompany = async (req, res, next) => {
  try {
    const { name, rfc, status } = req.body;
    const { id: tenantId } = req.tenant;
    const companyId = req.params.id;

    const company = await Company.findOne({ _id: companyId, tenantId });

    if (!company) {
      return next(new AppError('Company not found', 404));
    }

    if (name) company.name = name;
    if (rfc !== undefined) company.rfc = rfc;
    if (status) company.status = status;

    await company.save();

    res.json({
      success: true,
      data: { company },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete (deactivate) a company.
 */
export const deleteCompany = async (req, res, next) => {
  try {
    const { id: tenantId } = req.tenant;
    const companyId = req.params.id;

    const company = await Company.findOne({ _id: companyId, tenantId });

    if (!company) {
      return next(new AppError('Company not found', 404));
    }

    company.status = 'inactive';
    await company.save();

    res.json({
      success: true,
      message: 'Company deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};
