import Lot from '../models/Lot.js';
import Payment from '../models/Payment.js';
import Client from '../models/Client.js';
import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';
import PaymentAttempt from '../models/PaymentAttempt.js';
import AppError from '../utils/AppError.js';
import { uploadToR2 } from '../utils/storage.js';

/**
 * Get summary for the client portal dashboard
 */
export const getPortalSummary = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.user;
    
    if (!clientId) {
      return next(new AppError('No client associated with this account', 400));
    }

    // 1. Fetch contracts to identify lots under contract
    const contracts = await Contract.find({ client: clientId, tenantId }).select('lot');
    const contractLotIds = contracts.map(c => c.lot).filter(Boolean);

    // 2. Fetch all lots (either under contract or direct reservations)
    const lots = await Lot.find({
      $or: [
        { _id: { $in: contractLotIds } },
        { reservationBy: clientId }
      ],
      tenantId
    }).populate('companyId', 'name slug logo phone email');

    // 3. Fetch payment attempts for this client
    const attempts = await PaymentAttempt.find({ clientId, tenantId })
      .populate({
        path: 'contractId',
        populate: { path: 'lot' }
      })
      .sort({ createdAt: -1 });

    // 4. Calculate total invested (only approved attempts)
    const totalInvested = attempts
      .filter(a => a.status === 'APROBADO')
      .reduce((sum, a) => sum + a.amount, 0);

    // 5. Format recent payments (limit to 5) for the frontend expectation
    const recentPayments = attempts.slice(0, 5).map(a => {
      let statusStr = 'pending';
      if (a.status === 'APROBADO') statusStr = 'approved';
      if (a.status === 'RECHAZADO') statusStr = 'rejected';

      const lotNumber = a.contractId?.lot?.lotNumber;
      const stageName = a.contractId?.lot?.stage;
      const referenceName = lotNumber 
        ? `Abono Lote ${lotNumber}${stageName ? ` - ${stageName}` : ''}`
        : 'Abono General';

      return {
        _id: a._id,
        amount: a.amount,
        status: statusStr,
        referencia: referenceName,
        createdAt: a.createdAt
      };
    });

    // 6. Extract company contact details from the first available populated lot or contract
    let companySlug = null;
    let companyPhone = null;
    let companyEmail = null;

    const contractWithCompany = await Contract.findOne({ client: clientId, tenantId }).populate('companyId');
    if (contractWithCompany && contractWithCompany.companyId) {
      companySlug = contractWithCompany.companyId.slug;
      companyPhone = contractWithCompany.companyId.phone;
      companyEmail = contractWithCompany.companyId.email;
    } else if (lots.length > 0) {
      companySlug = lots[0].companyId?.slug;
      companyPhone = lots[0].companyId?.phone;
      companyEmail = lots[0].companyId?.email;
    }

    res.json({
      success: true,
      data: {
        lotsCount: lots.length,
        recentPayments,
        totalInvested,
        clientName: req.user.fullName,
        companySlug,
        companyPhone,
        companyEmail
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

    const contracts = await Contract.find({ client: clientId, tenantId });
    const contractLotIds = contracts.map(c => c.lot).filter(Boolean);

    const directLots = await Lot.find({
      $or: [
        { _id: { $in: contractLotIds } },
        { reservationBy: clientId }
      ],
      tenantId
    }).populate('companyId', 'name slug logo phone email').lean();

    const lots = directLots.map(lot => {
      const associatedContract = contracts.find(c => c.lot && c.lot.toString() === lot._id.toString());
      return {
        ...lot,
        contractId: associatedContract ? associatedContract._id : null
      };
    });

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

    const attempts = await PaymentAttempt.find({ clientId, tenantId })
      .populate({
        path: 'contractId',
        populate: { path: 'lot' }
      })
      .sort({ createdAt: -1 });

    const formattedPayments = attempts.map(a => {
      let statusStr = 'pending';
      if (a.status === 'APROBADO') statusStr = 'approved';
      if (a.status === 'RECHAZADO') statusStr = 'rejected';

      const lotNumber = a.contractId?.lot?.lotNumber;
      const stageName = a.contractId?.lot?.stage;
      const referenceName = lotNumber 
        ? `Cuota Lote ${lotNumber}${stageName ? ` - ${stageName}` : ''}`
        : 'Pago de Cuota Lote';

      return {
        _id: a._id,
        amount: a.amount,
        status: statusStr,
        referencia: referenceName,
        metodoPago: a.paymentMethod || 'Consignación',
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };
    });

    res.json({
      success: true,
      data: { payments: formattedPayments }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report a payment from the client portal
 */
export const reportPortalPayment = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.user;
    const { contractId, cuotaNumber, amount, banco, paymentMethod, fechaPago } = req.body;
    const file = req.file;

    if (!clientId) {
      return next(new AppError('No hay un cliente asociado a esta cuenta', 400));
    }

    if (!contractId || !cuotaNumber || !amount || !banco || !paymentMethod) {
      return next(new AppError('Todos los campos son requeridos', 400));
    }

    if (!file) {
      return next(new AppError('El comprobante de pago es obligatorio', 400));
    }

    // Verify contract belongs to this client
    const contract = await Contract.findOne({ _id: contractId, client: clientId, tenantId });
    if (!contract) {
      return next(new AppError('El contrato no pertenece al cliente autenticado', 403));
    }

    // Find the target quota
    const quota = await Quota.findOne({ contract: contractId, number: parseInt(cuotaNumber), tenantId });
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    let captureUrl = null;
    if (file) {
      captureUrl = await uploadToR2(file, 'payments');
      console.log('[LOG][PORTAL_REPORT_PAYMENT] Archivo subido exitosamente:', captureUrl);
    }

    const targetDate = fechaPago ? new Date(fechaPago) : new Date();
    const paymentAmount = parseFloat(amount);

    const attempt = await PaymentAttempt.create({
      tenantId,
      companyId: contract.companyId,
      contractId,
      clientId,
      quotas: [{
        quotaId: quota._id,
        amount: paymentAmount
      }],
      amount: paymentAmount,
      banco,
      paymentMethod,
      fechaPago: targetDate,
      comprobante: captureUrl || undefined,
      status: 'PENDIENTE'
    });

    console.log('[LOG][PORTAL_REPORT_PAYMENT] Intento de pago de portal creado exitosamente:', attempt._id);

    res.json({
      success: true,
      message: 'Pago reportado exitosamente. Pendiente de aprobación.',
    });
  } catch (error) {
    console.error('[LOG][PORTAL_REPORT_PAYMENT] Error crítico:', error);
    next(error);
  }
};
