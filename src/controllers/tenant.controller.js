import Tenant from '../models/Tenant.js';
import UserAccount from '../models/UserAccount.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import AppError from '../utils/AppError.js';

/**
 * Superadmin can create a brand new Tenant (Enterprise) 
 * along with its first Tenant Administrator.
 */
export const createTenantWithAdmin = async (req, res, next) => {
  try {
    const { 
      tenantName, 
      fullName, 
      email, 
      password, 
      plan, 
      nit, 
      documentoIdentidad, 
      tenantAddress, 
      tenantPhone, 
      tenantEmail 
    } = req.body;

    if (!tenantName || !fullName || !email || !password) {
      return next(new AppError('All fields are required', 400));
    }

    // Check if email already registered globally
    const existingAccount = await UserAccount.findOne({ email });
    if (existingAccount) {
      return next(new AppError('This email is already registered in the platform', 400));
    }

    // 1. Create the Tenant
    const newTenant = await Tenant.create({
      name: tenantName,
      plan: plan || 'basic',
      status: 'active',
      nit: nit,
      address: tenantAddress,
      phone: tenantPhone,
      email: tenantEmail,
    });

    // 2. Create the UserAccount
    const newAccount = await UserAccount.create({
      email,
      passwordHash: password, 
      fullName,
      documentoIdentidad,
      role: 'user', 
    });

    // 3. Create the User membership (tenant_admin)
    const membership = await User.create({
      accountId: newAccount._id,
      tenantId: newTenant._id,
      role: 'tenant_admin',
    });

    // 4. Create a default Company for this new Enterprise
    const defaultCompany = await Company.create({
      tenantId: newTenant._id,
      name: tenantName,
      nit: nit,
      address: tenantAddress,
      phone: tenantPhone,
      email: tenantEmail,
    });

    res.status(201).json({
      success: true,
      message: 'Enterprise and Admin created successfully',
      data: {
        tenant: newTenant,
        admin: newAccount,
        membership,
        company: defaultCompany,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Superadmin can list all tenants
 */
export const getAllTenants = async (req, res, next) => {
  try {
    const tenants = await Tenant.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: { tenants },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTenant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      plan, 
      subscriptionStart, 
      subscriptionEnd, 
      activeModules, 
      status, 
      nit,
      address,
      phone,
      email,
    } = req.body;

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return next(new AppError('Tenant not found', 404));
    }

    if (name) tenant.name = name;
    if (plan) tenant.plan = plan;
    if (subscriptionStart) tenant.subscriptionStart = subscriptionStart;
    if (subscriptionEnd) tenant.subscriptionEnd = subscriptionEnd;
    if (activeModules) tenant.activeModules = activeModules;
    if (status) tenant.status = status;
    if (nit !== undefined) tenant.nit = nit;
    if (address !== undefined) tenant.address = address;
    if (phone !== undefined) tenant.phone = phone;
    if (email !== undefined) tenant.email = email;

    await tenant.save();

    res.json({
      success: true,
      data: { tenant },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return next(new AppError('Tenant not found', 404));
    }
    res.json({
      success: true,
      data: { tenant },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMyTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { name, nit, address, phone, email } = req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return next(new AppError('Tenant not found', 404));
    }

    if (name) tenant.name = name;
    if (nit !== undefined) tenant.nit = nit;
    if (address !== undefined) tenant.address = address;
    if (phone !== undefined) tenant.phone = phone;
    if (email !== undefined) tenant.email = email;

    await tenant.save();

    res.json({
      success: true,
      data: { tenant },
    });
  } catch (error) {
    next(error);
  }
};
