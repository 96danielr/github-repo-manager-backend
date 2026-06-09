import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';
import Client from '../models/Client.js';
import Company from '../models/Company.js';
import AppError from '../utils/AppError.js';
import { sendSMS, sendEmail, sendWhatsApp } from '../utils/notifications.js';
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
          { path: 'lot', select: 'lotNumber stage nomenclature area manzana' },
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
            manzana: qObj.contract?.lot?.manzana || '-',
            nomenclatura: qObj.contract?.lot?.nomenclature || '-',
            lotNumber: qObj.contract?.lot?.lotNumber || '-',
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
    const statementUrl = `${apiUrl}/api/public/statement/${fullQuota.contract._id}`;
    
    // Update quota with receiptUrl if not set
    if (!fullQuota.receiptUrl) {
      await Quota.findByIdAndUpdate(quotaId, { receiptUrl });
    }
    
    // Send SMS & WhatsApp
    const clientPhone = fullQuota.contract.client.phone;
    if (clientPhone) {
      const message = `Cordial saludo ${fullQuota.contract.client.name}, su recibo de la cuota #${fullQuota.number} por $${(fullQuota.amountPaid || fullQuota.value).toLocaleString()} de ${company?.name || 'nuestra empresa'}. Ver recibo: ${receiptUrl} | Estado de Cuenta: ${statementUrl}`;
      await sendSMS(clientPhone, message);
      await sendWhatsApp(clientPhone, message);
    }

    // Send Email
    const clientEmail = fullQuota.contract.client.email;
    if (clientEmail) {
      const subject = `Recibo de Pago: Cuota #${fullQuota.number} - ${company?.name || 'Recaudos'}`;
      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #007cba;">Confirmación de Pago</h2>
          <p>Hola <strong>${fullQuota.contract.client.name}</strong>,</p>
          <p>Te enviamos el recibo oficial de tu pago de la cuota <strong>#${fullQuota.number}</strong> y tu estado de cuenta actualizado.</p>
          
          <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Monto:</strong> $${(fullQuota.amountPaid || fullQuota.value).toLocaleString()}</p>
            <p style="margin: 5px 0 0 0;"><strong>Concepto:</strong> Pago de cuota - ${fullQuota.contract.lot?.stage || 'Proyecto'}</p>
          </div>

          <p>Puedes descargar tu recibo de caja oficial y consultar tu estado de cuenta en línea utilizando los siguientes botones:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${receiptUrl}" style="background: #007cba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px; font-size: 14px;">
              VER RECIBO DE CAJA
            </a>
            <a href="${statementUrl}" style="background: #2e7d32; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px; font-size: 14px;">
              VER ESTADO DE CUENTA
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

    console.log('[LOG][APPROVE_PAYMENT] Solicitud de aprobación recibida:', {
      quotaId,
      tenantId,
      companyId
    });

    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      console.warn('[LOG][APPROVE_PAYMENT] Error: Cuota no encontrada con ID:', quotaId);
      return next(new AppError('Cuota no encontrada', 404));
    }

    if (quota.status === 'pagado') {
      console.warn('[LOG][APPROVE_PAYMENT] Advertencia: La cuota ya está en estado pagado:', quotaId);
      return next(new AppError('Esta cuota ya fue marcada como pagada', 400));
    }

    const paidQuotasAccumulator = [];

    // Check if the reported amountPaid exceeds the remaining quota value
    const quotaPendingValue = quota.value - (quota.amountPaid || 0);
    const reportedAmount = quota.amountPaid || quota.value;

    if (reportedAmount > quotaPendingValue) {
      let excess = reportedAmount - quotaPendingValue;
      console.log('[LOG][APPROVE_PAYMENT] Iniciando cascada de aprobación por exceso. Excedente:', excess);

      quota.status = 'pagado';
      quota.amountPaid = quota.value;
      await quota.save();
      paidQuotasAccumulator.push(quota._id);

      const queryFilter = {
        contract: quota.contract,
        tenantId,
        companyId,
        _id: { $ne: quotaId },
        status: { $in: ['pendiente', 'mora'] }
      };

      const pendingQuotas = await Quota.find(queryFilter).sort({ type: 1, number: 1 });
      for (const pq of pendingQuotas) {
        if (excess <= 0) break;

        const pqPendingValue = pq.value - (pq.amountPaid || 0);
        if (excess >= pqPendingValue) {
          pq.status = 'pagado';
          pq.amountPaid = pq.value;
          pq.paymentBank = quota.paymentBank;
          pq.paymentMethod = quota.paymentMethod;
          pq.paymentObservations = `${quota.paymentObservations || ''} (Aprobación excedente cascada de cuota #${quota.number})`;
          pq.paymentDate = quota.paymentDate || new Date();
          pq.paymentCapture = quota.paymentCapture;
          await pq.save();
          paidQuotasAccumulator.push(pq._id);
          excess -= pqPendingValue;
        } else {
          pq.amountPaid = (pq.amountPaid || 0) + excess;
          pq.paymentBank = quota.paymentBank;
          pq.paymentMethod = quota.paymentMethod;
          pq.paymentObservations = `${quota.paymentObservations || ''} (Aprobación abono excedente cascada de cuota #${quota.number})`;
          pq.paymentDate = quota.paymentDate || new Date();
          pq.paymentCapture = quota.paymentCapture;
          await pq.save();
          // We don't mark as fully paid, but save it and stop cascade
          excess = 0;
        }
      }
    } else {
      quota.status = 'pagado';
      await quota.save();
      paidQuotasAccumulator.push(quota._id);
    }

    try {
      const { sendConsolidatedPaymentNotifications } = await import('../utils/consolidatedNotifications.js');
      await sendConsolidatedPaymentNotifications(req, paidQuotasAccumulator, companyId);
    } catch (notificationError) {
      console.error('[LOG][APPROVE_PAYMENT] Error sending consolidated notifications:', notificationError);
    }

    await logAudit(req, {
      action: 'APPROVE_PAYMENT',
      module: 'PAYMENTS',
      targetId: quota._id,
      details: { amount: quota.amountPaid || quota.value, cuotaNumber: quota.number, approvedCount: paidQuotasAccumulator.length }
    });

    res.json({
      success: true,
      message: 'Cuota marcada como pagada exitosamente',
    });
  } catch (error) {
    console.error('[LOG][APPROVE_PAYMENT] Error crítico en aprobación:', error);
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
    const { tenantId, companyId, role } = req.user;
    const { quotaId, amount, bank, observations, paymentDate, fechaPago, paymentMethod } = req.body;

    if ((bank === 'Cruce de cuentas' || paymentMethod === 'Cruce de cuentas') && role !== 'admin') {
      return next(new AppError('No tienes permiso para registrar pagos por cruce de cuentas', 403));
    }
    const file = req.file;

    console.log('[LOG][REGISTER_MANUAL_PAYMENT] Solicitud de pago manual recibida:', {
      quotaId,
      amount,
      bank,
      observations,
      paymentDate,
      fechaPago,
      paymentMethod,
      tenantId,
      companyId,
      hasFile: !!file
    });

    // Use regular Quota.findOne with companyId for scoping
    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      console.warn('[LOG][REGISTER_MANUAL_PAYMENT] Error: Cuota no encontrada para el ID y empresa provistos:', { quotaId, companyId });
      return next(new AppError('Cuota no encontrada', 404));
    }

    console.log('[LOG][REGISTER_MANUAL_PAYMENT] Cuota inicial encontrada para registrar pago:', {
      quotaId: quota._id,
      contract: quota.contract,
      number: quota.number,
      value: quota.value,
      status: quota.status,
      amountPaid: quota.amountPaid
    });

    let captureUrl = null;
    if (file) {
      const { uploadToR2 } = await import('../utils/storage.js');
      captureUrl = await uploadToR2(file, 'payments');
      console.log('[LOG][REGISTER_MANUAL_PAYMENT] Archivo subido exitosamente:', captureUrl);
    }

    const finalPaymentDate = paymentDate || fechaPago || new Date();
    console.log('[LOG][REGISTER_MANUAL_PAYMENT] Fecha determinada para registro de pago:', finalPaymentDate);

    // Admin payments are auto-approved. If there is a payment excess, it cascades sequentially.
    const paidAmount = parseFloat(amount) || quota.value;
    const quotaPendingValue = quota.value - (quota.amountPaid || 0);

    const paidQuotasAccumulator = [];

    console.log('[LOG][REGISTER_MANUAL_PAYMENT] Montos a procesar:', {
      paidAmount,
      quotaPendingValue,
      isExcess: paidAmount > quotaPendingValue
    });

    if (paidAmount > quotaPendingValue) {
      let excess = paidAmount - quotaPendingValue;
      console.log('[LOG][REGISTER_MANUAL_PAYMENT] Iniciando cascada de pago por exceso. Excedente inicial:', excess);
      
      // Fully pay the selected quota
      quota.status = 'pagado';
      quota.amountPaid = quota.value;
      quota.paymentBank = bank;
      quota.paymentMethod = paymentMethod;
      quota.paymentObservations = `${observations || ''} (Pago inicial)`;
      quota.paymentDate = finalPaymentDate;
      if (captureUrl) {
        quota.paymentCapture = captureUrl;
      }
      await quota.save();
      paidQuotasAccumulator.push(quota._id);
      console.log('[LOG][REGISTER_MANUAL_PAYMENT] Cuota principal guardada y pagada en su totalidad.');

      // Fetch subsequent pending or in-mora quotas for this contract, sorted by type (inicial first) and number
      const queryFilter = {
        contract: quota.contract,
        tenantId,
        companyId,
        _id: { $ne: quotaId },
        status: { $in: ['pendiente', 'mora'] }
      };

      console.log('[LOG][REGISTER_MANUAL_PAYMENT] Buscando cuotas subsecuentes para cascada con filtro:', queryFilter);

      const pendingQuotas = await Quota.find(queryFilter).sort({ type: 1, number: 1 });
      console.log(`[LOG][REGISTER_MANUAL_PAYMENT] Se encontraron ${pendingQuotas.length} cuotas pendientes subsecuentes para cascada.`);

      for (const pq of pendingQuotas) {
        if (excess <= 0) {
          console.log('[LOG][REGISTER_MANUAL_PAYMENT] El excedente se ha agotado. Deteniendo cascada.');
          break;
        }

        const pqPendingValue = pq.value - (pq.amountPaid || 0);
        console.log(`[LOG][REGISTER_MANUAL_PAYMENT] Procesando cuota #${pq.number}:`, {
          quotaId: pq._id,
          value: pq.value,
          amountPaidBefore: pq.amountPaid,
          pendingValueNeeded: pqPendingValue,
          currentExcessLeft: excess
        });

        if (excess >= pqPendingValue) {
          // Fully pay this quota
          pq.status = 'pagado';
          pq.amountPaid = pq.value;
          pq.paymentBank = bank;
          pq.paymentMethod = paymentMethod;
          pq.paymentObservations = `${observations || ''} (Excedente en cascada de pago de la cuota #${quota.number})`;
          pq.paymentDate = finalPaymentDate;
          if (captureUrl) {
            pq.paymentCapture = captureUrl;
          }
          await pq.save();
          paidQuotasAccumulator.push(pq._id);
          console.log(`[LOG][REGISTER_MANUAL_PAYMENT] Cuota #${pq.number} PAGADA totalmente con excedente.`);

          excess -= pqPendingValue;
        } else {
          // Partially pay this quota
          pq.amountPaid = (pq.amountPaid || 0) + excess;
          pq.paymentBank = bank;
          pq.paymentMethod = paymentMethod;
          pq.paymentObservations = `${observations || ''} (Abono parcial en cascada de pago de la cuota #${quota.number})`;
          pq.paymentDate = finalPaymentDate;
          if (captureUrl) {
            pq.paymentCapture = captureUrl;
          }
          await pq.save();
          console.log(`[LOG][REGISTER_MANUAL_PAYMENT] Cuota #${pq.number} ABONADA parcialmente con saldo restante de ${excess}.`);

          excess = 0;
        }
      }
    } else {
      console.log('[LOG][REGISTER_MANUAL_PAYMENT] El pago es igual o menor al saldo pendiente de la cuota. Sin cascada.');
      quota.status = 'pagado';
      quota.amountPaid = paidAmount;
      quota.paymentBank = bank;
      quota.paymentMethod = paymentMethod;
      quota.paymentObservations = observations;
      quota.paymentDate = finalPaymentDate;
      if (captureUrl) {
        quota.paymentCapture = captureUrl;
      }
      await quota.save();
      paidQuotasAccumulator.push(quota._id);
      console.log('[LOG][REGISTER_MANUAL_PAYMENT] Cuota guardada exitosamente.');
    }

    try {
      const { sendConsolidatedPaymentNotifications } = await import('../utils/consolidatedNotifications.js');
      await sendConsolidatedPaymentNotifications(req, paidQuotasAccumulator, companyId);
    } catch (error) {
      console.error('[LOG][REGISTER_MANUAL_PAYMENT] Error sending consolidated notifications:', error);
    }

    await logAudit(req, {
      action: 'REGISTER_MANUAL_PAYMENT',
      module: 'PAYMENTS',
      targetId: quota._id,
      details: { 
        amount: quota.amountPaid, 
        bank, 
        cuotaNumber: quota.number,
        paymentMethod,
        approvedCount: paidQuotasAccumulator.length
      }
    });

    res.json({
      success: true,
      message: 'Pago registrado y aprobado exitosamente',
    });
  } catch (error) {
    console.error('[LOG][REGISTER_MANUAL_PAYMENT] Error crítico:', error);
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
