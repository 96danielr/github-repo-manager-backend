import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';
import Client from '../models/Client.js';
import Company from '../models/Company.js';
import AppError from '../utils/AppError.js';
import { sendSMS, sendEmail } from '../utils/notifications.js';

/**
 * Get all quotas (payments) for a given company with server-side pagination and filtering.
 * Uses the Quota model since each quota represents a payment record.
 */
export const getPayments = async (req, res, next) => {
  try {
    const { id: tenantId, companyId, role, userId } = req.tenant;
    const { page = 1, limit = 20, search, status, sortBy, order } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build dynamic sort
    let sortObj = { dueDate: -1 }; // Default
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
      .limit(limitNum);

    // Format for frontend expectations
    const formattedPayments = quotas.map((q) => {
      const qObj = q.toObject();

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
 * Mark a quota as "pagado" (paid).
 */
export const approvePayment = async (req, res, next) => {
  try {
    const { id: tenantId, companyId } = req.tenant;
    const { id: quotaId } = req.params;

    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    if (quota.status === 'pagado') {
      return next(new AppError('Esta cuota ya fue marcada como pagada', 400));
    }

    quota.status = 'pagado';
    
    // Generate receipt and send SMS
    try {
      const fullQuota = await Quota.findById(quotaId).populate({
        path: 'contract',
        populate: [
          { path: 'client' },
          { path: 'lot' },
        ],
      });
      
      const company = await Company.findById(companyId);
      
      if (fullQuota && fullQuota.contract && fullQuota.contract.client) {
        // Dynamic link instead of static file
        const apiUrl = process.env.API_URL || 'http://localhost:5000';
        const receiptUrl = `${apiUrl}/api/public/receipt/${quotaId}`;
        
        quota.receiptUrl = receiptUrl;
        
        // Send SMS
        const clientPhone = fullQuota.contract.client.phone;
        if (clientPhone) {
          const message = `Cordial saludo ${fullQuota.contract.client.name}, su pago de la cuota #${fullQuota.number} por $${(fullQuota.amountPaid || fullQuota.value).toLocaleString()} ha sido aprobado en ${company?.name || 'nuestra empresa'}. Ver recibo: ${receiptUrl}`;
          await sendSMS(clientPhone, message);
        }

        // Send Email
        const clientEmail = fullQuota.contract.client.email;
        if (clientEmail) {
          const subject = `Recibo de Pago de Cuota #${fullQuota.number} - ${company?.name || 'Recaudos'}`;
          const htmlMessage = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
              <h2 style="color: #007cba;">¡Pago Aprobado!</h2>
              <p>Hola <strong>${fullQuota.contract.client.name}</strong>,</p>
              <p>Esperamos que estés bien. Te informamos que hemos recibido y aprobado tu pago de la cuota <strong>#${fullQuota.number}</strong>.</p>
              
              <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Monto:</strong> $${(fullQuota.amountPaid || fullQuota.value).toLocaleString()}</p>
                <p style="margin: 5px 0 0 0;"><strong>Concepto:</strong> Pago de cuota - ${fullQuota.contract.lot?.stage || 'Proyecto'}</p>
              </div>

              <p>Puedes descargar tu recibo de caja oficial haciendo clic en el siguiente botón:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${receiptUrl}" style="background: #007cba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                  VER RECIBO DE CAJA
                </a>
              </div>

              <p style="font-size: 12px; color: #777; border-top: 1px solid #eee; pt: 15px; margin-top: 25px;">
                Cualquier duda, por favor contáctanos.<br>
                <strong>${company?.name || 'Inmobiliaria'}</strong>
              </p>
            </div>
          `;
          await sendEmail(clientEmail, subject, htmlMessage);
        }
      }
    } catch (error) {
      console.error('Error in receipt/SMS flow:', error);
      // We don't fail the approval if receipt/SMS fails, but we log it
    }

    await quota.save();

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
    const { id: tenantId, companyId } = req.tenant;
    const { id: quotaId } = req.params;

    const quota = await Quota.findOne({ _id: quotaId, tenantId, companyId });
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    // Revert to pendiente
    quota.status = 'pendiente';
    await quota.save();

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
    const { id: tenantId, companyId } = req.tenant;
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

    // Admin payments are auto-approved
    quota.status = 'pagado';
    quota.amountPaid = amount || quota.value;
    quota.paymentBank = bank;
    quota.paymentObservations = observations;
    quota.paymentDate = paymentDate || new Date();
    if (captureUrl) {
      quota.paymentCapture = captureUrl;
    }

    await quota.save();

    // Generate receipt and send SMS (Admin flow)
    try {
      const fullQuota = await Quota.findById(quotaId).populate({
        path: 'contract',
        populate: [
          { path: 'client' },
          { path: 'lot' },
        ],
      });
      
      const company = await Company.findById(companyId);
      
      if (fullQuota && fullQuota.contract && fullQuota.contract.client) {
        // Dynamic link instead of static file
        const apiUrl = process.env.API_URL || 'http://localhost:5000';
        const receiptUrl = `${apiUrl}/api/public/receipt/${quotaId}`;
        
        quota.receiptUrl = receiptUrl;
        await quota.save(); // Save again with receiptUrl
        const clientPhone = fullQuota.contract.client.phone;
        if (clientPhone) {
          const message = `Cordial saludo ${fullQuota.contract.client.name}, su pago manual de la cuota #${fullQuota.number} por $${fullQuota.amountPaid.toLocaleString()} ha sido registrado. Ver recibo: ${receiptUrl}`;
          await sendSMS(clientPhone, message);
        }

        // Send Email (Admin)
        const clientEmail = fullQuota.contract.client.email;
        if (clientEmail) {
          const subject = `Registro de Pago: Cuota #${fullQuota.number} - ${company?.name || 'Recaudos'}`;
          const htmlMessage = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
              <h2 style="color: #007cba;">Confirmación de Pago</h2>
              <p>Hola <strong>${fullQuota.contract.client.name}</strong>,</p>
              <p>Te informamos que se ha registrado manualmente un pago para tu cuota <strong>#${fullQuota.number}</strong>.</p>
              
              <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Monto:</strong> $${fullQuota.amountPaid.toLocaleString()}</p>
                <p style="margin: 5px 0 0 0;"><strong>Registrado el:</strong> ${new Date(fullQuota.paymentDate).toLocaleDateString()}</p>
              </div>

              <p>Tu recibo de caja oficial ya está disponible:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${receiptUrl}" style="background: #007cba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                  DESCARGAR RECIBO
                </a>
              </div>

              <p style="font-size: 12px; color: #777; border-top: 1px solid #eee; pt: 15px; margin-top: 25px;">
                Gracias por tu confianza.<br>
                <strong>${company?.name || 'Inmobiliaria'}</strong>
              </p>
            </div>
          `;
          await sendEmail(clientEmail, subject, htmlMessage);
        }
      }
    } catch (error) {
      console.error('Error in admin receipt/SMS flow:', error);
    }

    res.json({
      success: true,
      message: 'Pago registrado y aprobado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};
