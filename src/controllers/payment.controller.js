import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';
import Client from '../models/Client.js';
import Company from '../models/Company.js';
import AppError from '../utils/AppError.js';
import { sendSMS, sendEmail } from '../utils/notifications.js';
import { logAudit } from '../utils/auditLogger.js';

/**
 * Get all quotas (payments) for a given company with server-side pagination and filtering.
 * Uses the Quota model since each quota represents a payment record.
 */
export const getPayments = async (req, res, next) => {
  try {
    const { tenantId, companyId, role, userId } = req.user;
    const { page = 1, limit = 20, search, status, sortBy, order } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build dynamic sort
    let sortObj = { status: -1, paymentDate: -1, dueDate: 1 }; // Default: Pending approval first
    if (sortBy) {
      const sortField = {
        'amount': 'value',
        'cuotaNumber': 'number',
        'fechaPago': 'dueDate',
        'status': 'status',
        'createdAt': 'createdAt',
      }[sortBy] || sortBy;

      sortObj = { [sortField]: order === 'asc' ? 1 : -1 };
    }

    // Base filter by tenant and company
    let query = { 
      tenantId, 
      companyId,
      $or: [
        { status: 'pagado' },
        { paymentDate: { $ne: null } },
        { paymentCapture: { $ne: null } },
        { paymentBank: { $ne: null } },
      ],
    };

    // If seller role, restrict to their own sales' quotas
    if (role === 'vendedor') {
      const sellerContracts = await Contract.find({ tenantId, companyId, sellerId: userId }).select('_id');
      query.contract = { $in: sellerContracts.map((c) => c._id) };
    }

    // Map frontend status names to Quota status values
    if (status && status !== 'ALL') {
      const statusMap = {
        'PENDIENTE': 'pendiente',
        'PAGADO': 'pagado',
        'MORA': 'mora',
      };
      const requestedStatus = statusMap[status] || status.toLowerCase();
      
      // If filtering by status, we still want to ensure it's a "payment" (has data or is paid)
      // unless specifically searching for MORA or something.
      query.status = requestedStatus;
    }

    // Search by client name or idNumber
    if (search && search.trim()) {
      const matchingClients = await Client.find({
        tenantId,
        companyId,
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { idNumber: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const matchingContracts = await Contract.find({
        tenantId,
        companyId,
        client: { $in: matchingClients.map((c) => c._id) },
      }).select('_id');

      query.contract = { $in: matchingContracts.map((c) => c._id) };
    }

    const total = await Quota.countDocuments(query);
    const quotas = await Quota.find(query)
      .populate({
        path: 'contract',
        populate: [
          { path: 'client', select: 'name idNumber phone' },
          { path: 'lot', select: 'lotNumber stage nomenclature area' },
        ],
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Format for frontend expectations
    const formattedPayments = quotas.map((q) => {
      const qObj = q;

      // Map Quota status to frontend display status
      const statusMap = {
        'pendiente': 'PENDIENTE',
        'pagado': 'PAGADO',
        'mora': 'MORA',
      };

      return {
        id: qObj._id,
        cuotaNumber: qObj.number || 0,
        amount: qObj.amountPaid || qObj.value || 0,
        banco: qObj.paymentBank || 'N/A',
        fechaPago: qObj.paymentDate || qObj.dueDate,
        comprobante: qObj.paymentCapture || null,
        status: statusMap[qObj.status] || qObj.status?.toUpperCase() || 'PENDIENTE',
        type: qObj.type,
        contract: {
          client: {
            fullName: qObj.contract?.client?.name || 'Sin nombre',
            cedula: qObj.contract?.client?.idNumber || '',
            phone: qObj.contract?.client?.phone || '',
          },
          lot: {
            project: {
              name: qObj.contract?.lot?.stage || 'Sin proyecto',
            },
            manzana: qObj.contract?.lot?.lotNumber || '-',
            nomenclatura: qObj.contract?.lot?.nomenclature || '-',
          },
        },
        createdAt: qObj.createdAt,
        updatedAt: qObj.updatedAt,
        receiptUrl: qObj.receiptUrl || null,
      };
    });

    res.json({
      success: true,
      data: {
        payments: formattedPayments,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to send payment notifications (SMS and Email)
 */
const sendPaymentNotifications = async (req, quotaId, companyId) => {
  const fullQuota = await Quota.findById(quotaId).populate({
    path: 'contract',
    populate: [
      { path: 'client' },
      { path: 'lot' },
    ],
  });
  
  const company = await Company.findById(companyId);
  
  if (fullQuota && fullQuota.contract && fullQuota.contract.client) {
    const apiUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const receiptUrl = `${apiUrl}/api/public/receipt/${quotaId}`;
    
    // Update quota with receiptUrl if not set
    if (!fullQuota.receiptUrl) {
      await Quota.findByIdAndUpdate(quotaId, { receiptUrl });
    }
    
    // Send SMS
    const clientPhone = fullQuota.contract.client.phone;
    if (clientPhone) {
      const message = `Cordial saludo ${fullQuota.contract.client.name}, su recibo de la cuota #${fullQuota.number} por $${(fullQuota.amountPaid || fullQuota.value).toLocaleString()} de ${company?.name || 'nuestra empresa'}. Ver: ${receiptUrl}`;
      await sendSMS(clientPhone, message);
    }

    // Send Email
    const clientEmail = fullQuota.contract.client.email;
    if (clientEmail) {
      const subject = `Recibo de Pago: Cuota #${fullQuota.number} - ${company?.name || 'Recaudos'}`;
      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #007cba;">Confirmación de Pago</h2>
          <p>Hola <strong>${fullQuota.contract.client.name}</strong>,</p>
          <p>Te enviamos el recibo oficial de tu pago de la cuota <strong>#${fullQuota.number}</strong>.</p>
          
          <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Monto:</strong> $${(fullQuota.amountPaid || fullQuota.value).toLocaleString()}</p>
            <p style="margin: 5px 0 0 0;"><strong>Concepto:</strong> Pago de cuota - ${fullQuota.contract.lot?.stage || 'Proyecto'}</p>
          </div>

          <p>Puedes descargar tu recibo de caja oficial haciendo clic aquí:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${receiptUrl}" style="background: #007cba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              VER RECIBO DE CAJA
            </a>
          </div>

          <p style="font-size: 12px; color: #777; border-top: 1px solid #eee; pt: 15px; margin-top: 25px;">
            Gracias por tu puntualidad.<br>
            <strong>${company?.name || 'Inmobiliaria'}</strong>
          </p>
        </div>
      `;
      await sendEmail(clientEmail, subject, htmlMessage);
    }
    return true;
  }
  return false;
};

/**
 * Mark a quota as "pagado" (paid).
 */
export const approvePayment = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id: quotaId } = req.params;

    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    if (quota.status === 'pagado') {
      return next(new AppError('Esta cuota ya fue marcada como pagada', 400));
    }

    quota.status = 'pagado';
    
    // Generate receipt and send notifications
    try {
      await sendPaymentNotifications(req, quotaId, companyId);
    } catch (error) {
      console.error('Error in receipt/notification flow:', error);
    }

    await quota.save();

    await logAudit(req, {
      action: 'APPROVE_PAYMENT',
      module: 'PAYMENTS',
      targetId: quota._id,
      details: { amount: quota.amountPaid || quota.value, cuotaNumber: quota.number }
    });

    res.json({
      success: true,
      message: 'Cuota marcada como pagada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a quota back as "pendiente" or "mora" (reject/revert).
 */
export const rejectPayment = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id: quotaId } = req.params;

    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    // Revert to pendiente
    quota.status = 'pendiente';
    await quota.save();

    await logAudit(req, {
      action: 'REJECT_PAYMENT',
      module: 'PAYMENTS',
      targetId: quota._id,
      details: { cuotaNumber: quota.number }
    });

    res.json({
      success: true,
      message: 'Cuota revertida a pendiente',
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Admin: Manually register a payment for a quota (Auto-approved)
 */
export const registerManualPayment = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { quotaId, amount, bank, observations, paymentDate } = req.body;
    const file = req.file;

    // Use regular Quota.findOne with companyId for scoping
    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    let captureUrl = null;
    if (file) {
      const { uploadToR2 } = await import('../utils/storage.js');
      captureUrl = await uploadToR2(file, 'payments');
    }

    // Admin payments are auto-approved. If there is a payment excess, it cascades sequentially.
    const paidAmount = parseFloat(amount) || quota.value;
    const quotaPendingValue = quota.value - (quota.amountPaid || 0);

    if (paidAmount > quotaPendingValue) {
      let excess = paidAmount - quotaPendingValue;
      
      // Fully pay the selected quota
      quota.status = 'pagado';
      quota.amountPaid = quota.value;
      quota.paymentBank = bank;
      quota.paymentObservations = `${observations || ''} (Pago inicial)`;
      quota.paymentDate = paymentDate || new Date();
      if (captureUrl) {
        quota.paymentCapture = captureUrl;
      }
      await quota.save();

      try {
        await sendPaymentNotifications(req, quotaId, companyId);
      } catch (error) {
        console.error('Error in receipt/notification flow for primary quota:', error);
      }

      // Fetch subsequent pending or in-mora quotas for this contract, sorted by type (inicial first) and number
      const pendingQuotas = await Quota.find({
        contract: quota.contract,
        tenantId,
        companyId,
        _id: { $ne: quotaId },
        status: { $in: ['pendiente', 'mora'] }
      }).sort({ type: 1, number: 1 });

      for (const pq of pendingQuotas) {
        if (excess <= 0) break;

        const pqPendingValue = pq.value - (pq.amountPaid || 0);
        if (excess >= pqPendingValue) {
          // Fully pay this quota
          pq.status = 'pagado';
          pq.amountPaid = pq.value;
          pq.paymentBank = bank;
          pq.paymentObservations = `${observations || ''} (Excedente en cascada de pago de la cuota #${quota.number})`;
          pq.paymentDate = paymentDate || new Date();
          if (captureUrl) {
            pq.paymentCapture = captureUrl;
          }
          await pq.save();

          try {
            await sendPaymentNotifications(req, pq._id, companyId);
          } catch (error) {
            console.error('Error in receipt/notification flow for cascaded quota:', error);
          }

          excess -= pqPendingValue;
        } else {
          // Partially pay this quota
          pq.amountPaid = (pq.amountPaid || 0) + excess;
          pq.paymentBank = bank;
          pq.paymentObservations = `${observations || ''} (Abono parcial en cascada de pago de la cuota #${quota.number})`;
          pq.paymentDate = paymentDate || new Date();
          if (captureUrl) {
            pq.paymentCapture = captureUrl;
          }
          await pq.save();

          excess = 0;
        }
      }
    } else {
      quota.status = 'pagado';
      quota.amountPaid = paidAmount;
      quota.paymentBank = bank;
      quota.paymentObservations = observations;
      quota.paymentDate = paymentDate || new Date();
      if (captureUrl) {
        quota.paymentCapture = captureUrl;
      }
      await quota.save();

      try {
        await sendPaymentNotifications(req, quotaId, companyId);
      } catch (error) {
        console.error('Error in admin receipt/notification flow:', error);
      }
    }

    await logAudit(req, {
      action: 'REGISTER_MANUAL_PAYMENT',
      module: 'PAYMENTS',
      targetId: quota._id,
      details: { 
        amount: quota.amountPaid, 
        bank, 
        cuotaNumber: quota.number
      }
    });

    res.json({
      success: true,
      message: 'Pago registrado y aprobado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend payment receipt to client
 */
export const resendReceipt = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id: quotaId } = req.params;

    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      return next(new AppError('Pago no encontrado', 404));
    }

    if (quota.status !== 'pagado') {
      return next(new AppError('Solo se pueden reenviar recibos de pagos aprobados', 400));
    }

    const sent = await sendPaymentNotifications(req, quotaId, companyId);
    
    if (!sent) {
      return next(new AppError('No se pudo enviar el recibo. Verifique que el cliente tenga datos de contacto.', 400));
    }

    await logAudit(req, {
      action: 'RESEND_RECEIPT',
      module: 'PAYMENTS',
      targetId: quota._id,
      details: { cuotaNumber: quota.number }
    });

    res.json({
      success: true,
      message: 'Recibo reenviado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};
