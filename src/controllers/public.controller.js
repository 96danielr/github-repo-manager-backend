import Client from '../models/Client.js';
import Company from '../models/Company.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';
import AppError from '../utils/AppError.js';
import { uploadToR2 } from '../utils/storage.js';

/**
 * Get client information and their lot contracts with pending quotas
 */
export const getClientInfo = async (req, res, next) => {
  try {
    const { companySlug, idNumber } = req.params;

    const company = await Company.findOne({ slug: companySlug });
    if (!company) {
      return next(new AppError('Empresa no encontrada', 404));
    }

    const client = await Client.findOne({ 
      idNumber, 
      companyId: company._id,
    });
    
    if (!client) {
      return next(new AppError('Cliente no encontrado en esta empresa', 404));
    }

    const contracts = await Contract.find({ 
      client: client._id,
      companyId: company._id,
    }).populate('lot');

    const contractsWithQuotas = await Promise.all(contracts.map(async (contract) => {
      const quotas = await Quota.find({ contract: contract._id })
        .sort({ type: 1, number: 1 }); // 'inicial' < 'normal'
      
      return {
        ...contract.toObject(),
        quotas: quotas.map((q) => ({
          _id: q._id,
          number: q.number,
          type: q.type,
          value: q.value,
          dueDate: q.dueDate,
          status: q.status,
        })),
      };
    }));

    res.json({
      success: true,
      data: {
        client: {
          name: client.name,
          idNumber: client.idNumber,
        },
        contracts: contractsWithQuotas,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report a payment for a specific quota (Client Flow)
 */
export const reportPayment = async (req, res, next) => {
  try {
    const { quotaId, amount, bank, observations, paymentDate, phone, email } = req.body;
    const file = req.file;

    if (!quotaId) {
      return next(new AppError('El ID de la cuota es requerido', 400));
    }

    const quota = await Quota.findById(quotaId);
    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    let captureUrl = null;
    if (file) {
      captureUrl = await uploadToR2(file, 'payments');
    }

    // Update quota with pending payment info
    // Client payments are always PENDING
    quota.status = 'pendiente'; 
    quota.amountPaid = amount || quota.value;
    quota.paymentBank = bank;
    quota.paymentObservations = observations;
    quota.paymentDate = paymentDate || new Date();
    if (captureUrl) {
      quota.paymentCapture = captureUrl;
    }

    await quota.save();

    // Update client contact info if provided
    try {
      const contract = await Contract.findById(quota.contract);
      if (contract) {
        const client = await Client.findById(contract.client);
        if (client) {
          let updated = false;
          if (phone && phone !== client.phone) {
            client.phone = phone;
            updated = true;
          }
          if (email && email !== client.email) {
            client.email = email;
            updated = true;
          }
          if (updated) await client.save();
        }
      }
    } catch (err) {
      console.error('Error updating client info during payment report:', err);
      // We don't block the payment report if client update fails
    }

    res.json({
      success: true,
      message: 'Pago reportado exitosamente. Pendiente de aprobación.',
    });
  } catch (error) {
    next(error);
  }
};
