import UserAccount from '../models/UserAccount.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import Company from '../models/Company.js';
import UserCompany from '../models/UserCompany.js';
import AppError from '../utils/AppError.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} from '../utils/jwt.js';

/**
 * Build JWT payload for a given membership.
 */
const buildTokenPayload = async (account, membership) => {
  // Handle populated vs non-populated tenantId
  const tenantId = membership.tenantId?._id
    ? membership.tenantId._id.toString()
    : membership.tenantId.toString();

  // Load companies the user has access to
  let companies = [];

  if (membership.role === 'tenant_admin') {
    // Tenant admins can see all companies in the tenant
    const allCompanies = await Company.find({
      tenantId,
      status: 'active',
    }).select('_id');
    companies = allCompanies.map((c) => ({ id: c._id.toString(), role: 'tenant_admin' }));
  } else {
    const userCompanies = await UserCompany.find({
      userId: membership._id,
      tenantId,
    }).populate('companyId', '_id');
    companies = userCompanies.map((uc) => ({
      id: uc.companyId._id.toString(),
      role: uc.role,
    }));
  }

  return {
    accountId: account._id.toString(),
    userId: membership._id.toString(),
    tenantId,
    role: membership.role,
    companies,
  };
};

/**
 * Build a clean user response object for the frontend.
 */
const buildUserResponse = (account, membership) => {
  const tenantObj = membership.tenantId; // may be populated object or ObjectId
  return {
    id: account._id.toString(),
    email: account.email,
    fullName: account.fullName,
    role: membership.role,
    tenantId: tenantObj?._id ? tenantObj._id.toString() : tenantObj.toString(),
    tenantName: tenantObj?.name || '',
    plan: tenantObj?.plan || 'basic',
    activeModules: tenantObj?.activeModules || ['cobranzas'],
    subscriptionStart: tenantObj?.subscriptionStart,
    subscriptionEnd: tenantObj?.subscriptionEnd,
  };
};

/**
 * POST /auth/register
 * Atomic: creates Tenant + UserAccount + User (tenant_admin) + a default Company.
 */
export const register = async (req, res, next) => {
  try {
    const { fullName, email, password, tenantName, companyName } = req.body;

    // Check if account already exists
    const existingAccount = await UserAccount.findOne({ email });
    if (existingAccount) {
      return next(new AppError('Email already registered', 400));
    }

    // 1. Create Tenant
    const tenant = await Tenant.create({
      name: tenantName || `${fullName}'s Team`,
    });

    // 2. Create UserAccount
    const account = await UserAccount.create({
      email,
      passwordHash: password,
      fullName,
    });

    // 3. Create User membership (tenant_admin)
    const membership = await User.create({
      accountId: account._id,
      tenantId: tenant._id,
      role: 'tenant_admin',
    });

    // 4. Create a default Company
    const company = await Company.create({
      tenantId: tenant._id,
      name: companyName || 'Mi Empresa',
    });

    // Generate tokens
    const payload = await buildTokenPayload(account, membership);
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(account._id);

    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      data: {
        user: {
          ...account.toJSON(),
          role: membership.role,
          tenantId: tenant._id,
          tenantName: tenant.name,
        },
        tenant: tenant.toJSON(),
        company: company.toJSON(),
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/login
 * Step 1: Verify credentials.
 * If user has ONE active membership → return JWT directly.
 * If user has MULTIPLE memberships → return list for selection.
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find account with password
    const account = await UserAccount.findOne({ email }).select('+passwordHash');

    if (!account || !(await account.comparePassword(password))) {
      return next(new AppError('Invalid email or password', 401));
    }

    if (account.status !== 'active') {
      return next(new AppError('Account is deactivated', 401));
    }

    // Find all active memberships
    const memberships = await User.find({
      accountId: account._id,
      status: 'active',
    }).populate('tenantId', 'name plan status activeModules subscriptionStart subscriptionEnd');

    // Filter memberships with active tenants
    const activeMemberships = memberships.filter(
      (m) => m.tenantId && m.tenantId.status !== 'suspended'
    );

    if (activeMemberships.length === 0) {
      return next(new AppError('No active team memberships found', 401));
    }

    // Update last login
    account.lastLogin = new Date();
    await account.save({ validateBeforeSave: false });

    if (activeMemberships.length === 1) {
      // Single membership — generate JWT directly
      const membership = activeMemberships[0];
      const payload = await buildTokenPayload(account, membership);
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(account._id);

      setTokenCookies(res, accessToken, refreshToken);

      return res.json({
        success: true,
        data: {
          requiresTenantSelection: false,
          user: buildUserResponse(account, membership),
          accessToken,
        },
      });
    }

    // Multiple memberships — return list for selection
    return res.json({
      success: true,
      data: {
        requiresTenantSelection: true,
        accountId: account._id,
        memberships: activeMemberships.map((m) => ({
          userId: m._id,
          tenantId: m.tenantId._id,
          tenantName: m.tenantId.name,
          role: m.role,
          plan: m.tenantId.plan,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/select-tenant
 * Step 2 (only if multiple memberships): select which tenant to work with.
 */
export const selectTenant = async (req, res, next) => {
  try {
    const { accountId, tenantId } = req.body;

    if (!accountId || !tenantId) {
      return next(new AppError('accountId and tenantId are required', 400));
    }

    const account = await UserAccount.findById(accountId);
    if (!account || account.status !== 'active') {
      return next(new AppError('Account not found or inactive', 401));
    }

    const membership = await User.findOne({
      accountId: account._id,
      tenantId: tenantId,
      status: 'active',
    }).populate('tenantId', 'name plan status activeModules subscriptionStart subscriptionEnd');

    if (!membership) {
      return next(new AppError('No active membership for this tenant', 401));
    }

    if (membership.tenantId.status === 'suspended') {
      return next(new AppError('This team is suspended', 403));
    }

    const payload = await buildTokenPayload(account, membership);
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(account._id);

    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      data: {
        user: buildUserResponse(account, membership),
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/logout
 */
export const logout = async (req, res, next) => {
  try {
    clearTokenCookies(res);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/me
 */
export const getMe = async (req, res, next) => {
  try {
    const account = await UserAccount.findById(req.user.accountId);

    // Load current tenant info
    const tenant = await Tenant.findById(req.user.tenantId);

    // Load companies
    let companies = [];
    if (req.user.role === 'tenant_admin') {
      companies = await Company.find({
        tenantId: req.user.tenantId,
        status: 'active',
      });
    } else {
      const userCompanies = await UserCompany.find({
        userId: req.user.userId,
        tenantId: req.user.tenantId,
      }).populate('companyId');
      companies = userCompanies.map((uc) => uc.companyId);
    }

    res.json({
      success: true,
      data: {
        user: {
          ...account.toJSON(),
          role: req.user.role,
          tenantId: req.user.tenantId,
          tenantName: tenant?.name,
        },
        tenant: tenant?.toJSON(),
        companies: companies.map((c) => c.toJSON()),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/refresh
 */
export const refreshTokenHandler = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return next(new AppError('No refresh token provided', 401));
    }

    const decoded = verifyRefreshToken(token);

    const account = await UserAccount.findById(decoded.accountId);

    if (!account || account.status !== 'active') {
      return next(new AppError('Account not found or inactive', 401));
    }

    // Find the most recent active membership
    const membership = await User.findOne({
      accountId: account._id,
      status: 'active',
    }).sort({ updatedAt: -1 });

    if (!membership) {
      return next(new AppError('No active membership found', 401));
    }

    const payload = await buildTokenPayload(account, membership);
    const accessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(account._id);

    setTokenCookies(res, accessToken, newRefreshToken);

    res.json({
      success: true,
      data: { accessToken },
    });
  } catch (error) {
    clearTokenCookies(res);
    next(new AppError('Invalid refresh token', 401));
  }
};
