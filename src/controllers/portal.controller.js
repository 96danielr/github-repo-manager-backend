import Lot from '../models/Lot.js';
import Payment from '../models/Payment.js';
import Client from '../models/Client.js';
import AppError from '../utils/AppError.js';

/**
 * Get summary for the client portal dashboard
 */
export const getPortalSummary = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.user;
    
    if (!clientId) {
      return next(new AppError('No client associated with this account', 400));
    }

    const [lots, payments] = await Promise.all([
      Lot.find({ reservationBy: clientId, tenantId }),
      Payment.find({ client: clientId, tenantId }).sort({ createdAt: -1 }).limit(5)
    ]);

    const totalInvested = payments
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      data: {
        lotsCount: lots.length,
        recentPayments: payments,
        totalInvested,
        clientName: req.user.fullName
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all lots for the logged-in client
 */
export const getMyLots = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.user;
    
    if (!clientId) {
      return next(new AppError('No client associated with this account', 400));
    }

    const lots = await Lot.find({ reservationBy: clientId, tenantId })
      .populate('companyId', 'name');

    res.json({
      success: true,
      data: { lots }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all payments for the logged-in client
 */
export const getMyPayments = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.user;
    
    if (!clientId) {
      return next(new AppError('No client associated with this account', 400));
    }

    const payments = await Payment.find({ client: clientId, tenantId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { payments }
    });
  } catch (error) {
    next(error);
  }
};
