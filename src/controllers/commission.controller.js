import Commission from '../models/Commission.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { getNextSequence } from '../models/Counter.js';
import { sendEmail, sendWhatsApp } from '../utils/notifications.js';

// GET /commissions — list commissions with filters.
// Seller roles only see their own commissions.
export const getCommissions = async (req, res, next) => {
  try {
    const { tenantId, companyId, role, userId } = req.user;
    const { status, contractId, sellerId } = req.query;

    const filter = { tenantId, companyId };
    if (role === 'vendedor' || role === 'ejecutivo_comercial' || role === 'agent') {
      filter.sellerId = userId;
    } else if (sellerId) {
      filter.sellerId = sellerId;
    }
    if (contractId) filter.contractId = contractId;

    let commissions = await Commission.find(filter)
      .sort({ createdAt: -1 })
      .populate({
        path: 'contractId',
        populate: [
          { path: 'client', select: 'name idNumber' },
          { path: 'lot', select: 'nomenclature stage manzana lotNumber' },
        ],
      })
      .populate({
        path: 'sellerId',
        select: 'accountId',
        populate: { path: 'accountId', select: 'fullName email' },
      });

    if (status) {
      commissions = commissions.filter((c) =>
        c.installments.some((i) => i.status === status)
      );
    }

    res.json({
      success: true,
      data: { commissions },
    });
  } catch (error) {
    next(error);
  }
};

const getInstallment = (commission, installmentIndex) => {
  const idx = parseInt(installmentIndex, 10);
  if (Number.isNaN(idx) || !commission.installments[idx]) return null;
  return { idx, installment: commission.installments[idx] };
};

const notifySeller = async (commission, message, subject) => {
  try {
    const seller = await User.findById(commission.sellerId).populate({
      path: 'accountId',
      select: 'fullName email phone',
    });
    if (!seller?.accountId) return;
    if (seller.accountId.email) {
      await sendEmail(seller.accountId.email, subject, `<p>${message}</p>`);
    }
    if (seller.accountId.phone) {
      await sendWhatsApp(seller.accountId.phone, message);
    }
  } catch (error) {
    console.error('[COMMISSION] Error notificando al asesor:', error);
  }
};

const notifyAccountants = async (tenantId, message, subject) => {
  try {
    const accountants = await User.find({
      tenantId,
      role: { $in: ['contador', 'auxiliar_contable'] },
      status: 'active',
    }).populate({ path: 'accountId', select: 'fullName email phone' });

    for (const acc of accountants) {
      if (!acc.accountId) continue;
      if (acc.accountId.email) {
        await sendEmail(acc.accountId.email, subject, `<p>${message}</p>`);
      }
      if (acc.accountId.phone) {
        await sendWhatsApp(acc.accountId.phone, message);
      }
    }
  } catch (error) {
    console.error('[COMMISSION] Error notificando a contabilidad:', error);
  }
};

// POST /commissions/:id/radicar — the seller files their billing (cuenta de cobro)
export const radicarComision = async (req, res, next) => {
  try {
    const { tenantId, companyId, role, userId } = req.user;
    const { id } = req.params;
    const { installmentIndex } = req.body;

    const commission = await Commission.findOne({ _id: id, tenantId, companyId });
    if (!commission) return next(new AppError('Comisión no encontrada', 404));

    const isOwner = commission.sellerId && commission.sellerId.toString() === userId;
    const isAdminRole = !['vendedor', 'ejecutivo_comercial', 'agent'].includes(role);
    if (!isOwner && !isAdminRole) {
      return next(new AppError('Solo el asesor dueño de la venta puede radicar esta cuenta de cobro', 403));
    }

    const found = getInstallment(commission, installmentIndex);
    if (!found) return next(new AppError('Desembolso no encontrado en la comisión', 400));
    const { installment } = found;

    if (installment.status !== 'AVAILABLE' && installment.status !== 'REJECTED') {
      return next(new AppError('Solo se pueden radicar desembolsos disponibles', 400));
    }

    installment.status = 'FILED';
    installment.filedAt = new Date();
    installment.filedBy = userId;
    installment.billingNumber = await getNextSequence(companyId, tenantId, 'BILLING');
    installment.rejectedBy = undefined;
    installment.rejectedAt = undefined;
    installment.rejectedReason = undefined;
    await commission.save();

    await notifyAccountants(
      tenantId,
      `Se ha radicado una cuenta de cobro por $${installment.amount.toLocaleString('es-CO')} (consecutivo #${installment.billingNumber}). Ingresa al módulo de Comisiones para aprobarla o rechazarla.`,
      `Cuenta de cobro radicada #${installment.billingNumber}`
    );

    res.json({
      success: true,
      message: 'Cuenta de cobro radicada exitosamente',
      data: { commission },
    });
  } catch (error) {
    next(error);
  }
};

// POST /commissions/:id/aprobar — accountant approves the billing
export const aprobarComision = async (req, res, next) => {
  try {
    const { tenantId, companyId, userId } = req.user;
    const { id } = req.params;
    const { installmentIndex, observacion } = req.body;

    const commission = await Commission.findOne({ _id: id, tenantId, companyId });
    if (!commission) return next(new AppError('Comisión no encontrada', 404));

    const found = getInstallment(commission, installmentIndex);
    if (!found) return next(new AppError('Desembolso no encontrado en la comisión', 400));
    const { installment } = found;

    if (installment.status !== 'FILED') {
      return next(new AppError('Solo se pueden aprobar cuentas de cobro radicadas', 400));
    }

    installment.status = 'APPROVED';
    installment.approvedBy = userId;
    installment.approvedAt = new Date();
    installment.approvalNote = observacion || '';
    await commission.save();

    await notifySeller(
      commission,
      `Tu cuenta de cobro #${installment.billingNumber} por $${installment.amount.toLocaleString('es-CO')} fue APROBADA.`,
      'Cuenta de cobro aprobada'
    );

    res.json({
      success: true,
      message: 'Cuenta de cobro aprobada',
      data: { commission },
    });
  } catch (error) {
    next(error);
  }
};

// POST /commissions/:id/rechazar — accountant rejects the billing (reason required)
export const rechazarComision = async (req, res, next) => {
  try {
    const { tenantId, companyId, userId } = req.user;
    const { id } = req.params;
    const { installmentIndex, rejectedReason } = req.body;

    if (!rejectedReason || !rejectedReason.trim()) {
      return next(new AppError('La observación de rechazo es obligatoria', 400));
    }

    const commission = await Commission.findOne({ _id: id, tenantId, companyId });
    if (!commission) return next(new AppError('Comisión no encontrada', 404));

    const found = getInstallment(commission, installmentIndex);
    if (!found) return next(new AppError('Desembolso no encontrado en la comisión', 400));
    const { installment } = found;

    if (installment.status !== 'FILED') {
      return next(new AppError('Solo se pueden rechazar cuentas de cobro radicadas', 400));
    }

    installment.status = 'REJECTED';
    installment.rejectedBy = userId;
    installment.rejectedAt = new Date();
    installment.rejectedReason = rejectedReason.trim();
    await commission.save();

    await notifySeller(
      commission,
      `Tu cuenta de cobro #${installment.billingNumber} por $${installment.amount.toLocaleString('es-CO')} fue RECHAZADA. Motivo: ${rejectedReason.trim()}. Puedes corregirla y volver a radicarla.`,
      'Cuenta de cobro rechazada'
    );

    res.json({
      success: true,
      message: 'Cuenta de cobro rechazada',
      data: { commission },
    });
  } catch (error) {
    next(error);
  }
};

// POST /commissions/:id/pagar — treasury/accountant marks the billing as paid
export const pagarComision = async (req, res, next) => {
  try {
    const { tenantId, companyId, userId } = req.user;
    const { id } = req.params;
    const { installmentIndex } = req.body;

    const commission = await Commission.findOne({ _id: id, tenantId, companyId });
    if (!commission) return next(new AppError('Comisión no encontrada', 404));

    const found = getInstallment(commission, installmentIndex);
    if (!found) return next(new AppError('Desembolso no encontrado en la comisión', 400));
    const { installment } = found;

    if (installment.status !== 'APPROVED') {
      return next(new AppError('Solo se pueden pagar cuentas de cobro aprobadas', 400));
    }

    installment.status = 'PAID';
    installment.paidBy = userId;
    installment.paidAt = new Date();
    await commission.save();

    await notifySeller(
      commission,
      `Tu comisión por $${installment.amount.toLocaleString('es-CO')} (cuenta de cobro #${installment.billingNumber}) fue PAGADA. ¡Felicitaciones!`,
      'Comisión pagada'
    );

    res.json({
      success: true,
      message: 'Comisión marcada como pagada',
      data: { commission },
    });
  } catch (error) {
    next(error);
  }
};
