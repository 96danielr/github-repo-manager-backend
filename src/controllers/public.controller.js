import Client from '../models/Client.js';
import Company from '../models/Company.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';
import AppError from '../utils/AppError.js';
import { uploadToR2 } from '../utils/storage.js';
import { generateReceiptStream } from '../utils/receipt.js';
import { generateStatementStream } from '../utils/statement.js';

/**
 * Generate a dynamic PDF receipt for a paid quota (Public endpoint)
 */
export const getReceiptPDF = async (req, res, next) => {
  try {
    let { quotaId } = req.params;
    quotaId = quotaId.replace(/[^a-fA-F0-9]/g, '');

    const quota = await Quota.findById(quotaId)
      .populate({
        path: 'contract',
        populate: [
          { path: 'client' },
          { path: 'lot' },
        ],
      });

    if (!quota) {
      return next(new AppError('Cuota no encontrada', 404));
    }

    if (quota.status !== 'pagado') {
      return next(new AppError('El recibo solo está disponible para cuotas pagadas', 400));
    }

    const company = await Company.findById(quota.companyId);

    const receiptData = {
      quotaNumber: quota.number,
      amount: quota.amountPaid || quota.value,
      date: quota.paymentDate || quota.updatedAt,
      clientName: quota.contract.client.name,
      clientId: quota.contract.client.idNumber,
      clientPhone: quota.contract.client.phone || '',
      clientAddress: quota.contract.client.address || '',
      clientCity: quota.contract.client.expeditionPlace || '',
      companyName: company?.name || '',
      companyNit: company?.nit || '',
      companyAddress: company?.address || '',
      companyPhone: company?.phone || '',
      companyLogo: company?.projectLogo || company?.logo || '',
      lotInfo: quota.contract.lot 
        ? `Etapa: ${quota.contract.lot.stage || '-'} - Manzana: ${quota.contract.lot.manzana || '-'} - Lote: ${quota.contract.lot.lotNumber || '-'}${quota.contract.lot.nomenclature ? ` (${quota.contract.lot.nomenclature})` : ''}`
        : 'N/A',
      paymentBank: quota.paymentBank,
      observations: quota.paymentObservations,
      paymentCapture: quota.paymentCapture,
    };

    await generateReceiptStream(receiptData, res);
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a dynamic PDF account statement for a contract (Public endpoint)
 */
export const getStatementPDF = async (req, res, next) => {
  try {
    let { contractId } = req.params;
    contractId = contractId.replace(/[^a-fA-F0-9]/g, '');

    const contract = await Contract.findById(contractId)
      .populate('client')
      .populate('lot');

    if (!contract) {
      return next(new AppError('Contrato no encontrado', 404));
    }

    const company = await Company.findById(contract.companyId);

    // Fetch all quotas for the contract sorted by type then number
    const quotas = await Quota.find({ contract: contractId })
      .sort({ type: 1, number: 1 });

    // Calculate aggregated metrics
    const totalValue = contract.totalValue || 0;
    const totalPaid = quotas.reduce((sum, q) => sum + (q.amountPaid || 0), 0);
    const totalPending = Math.max(0, totalValue - totalPaid);
    const averageRecaudo = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

    // Breakdown metrics
    const initialQuotas = quotas.filter(q => q.type === 'inicial');
    const normalQuotas = quotas.filter(q => q.type === 'normal');

    const valorTotalInicial = initialQuotas.reduce((sum, q) => sum + (q.value || 0), 0);
    const valorPagadoInicial = initialQuotas.reduce((sum, q) => sum + (q.amountPaid || 0), 0);
    const totalCuotasIniciales = initialQuotas.length;
    const cuotasInicialesPagadas = initialQuotas.filter(q => q.status === 'pagado').length;

    const valorTotalCuotas = normalQuotas.reduce((sum, q) => sum + (q.value || 0), 0);
    const valorPagadoCuotas = normalQuotas.reduce((sum, q) => sum + (q.amountPaid || 0), 0);
    const totalCuotasNormales = normalQuotas.length;
    const cuotasNormalesPagadas = normalQuotas.filter(q => q.status === 'pagado').length;

    const lotInfo = contract.lot 
      ? `Etapa: ${contract.lot.stage || '-'} - Manzana: ${contract.lot.manzana || '-'} - Lote: ${contract.lot.lotNumber || '-'}${contract.lot.nomenclature ? ` (${contract.lot.nomenclature})` : ''}`
      : 'N/A';

    const statementData = {
      contractId: contract._id,
      clientName: contract.client?.name || 'N/A',
      clientId: contract.client?.idNumber || 'N/A',
      clientPhone: contract.client?.phone || '',
      clientEmail: contract.client?.email || '',
      projectName: contract.negotiation || 'Proyecto sin nombre',
      lotInfo,
      companyName: company?.name || '',
      companyNit: company?.nit || '',
      companyAddress: company?.address || '',
      companyPhone: company?.phone || '',
      companyLogo: company?.projectLogo || company?.logo || '',
      // Financial numbers
      totalValue,
      totalPaid,
      totalPending,
      averageRecaudo,
      // Breakdown
      valorTotalInicial,
      valorPagadoInicial,
      totalCuotasIniciales,
      cuotasInicialesPagadas,
      valorTotalCuotas,
      valorPagadoCuotas,
      totalCuotasNormales,
      cuotasNormalesPagadas,
      // Detailed list of quotas
      quotas,
    };

    await generateStatementStream(statementData, res);
  } catch (error) {
    next(error);
  }
};

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
    }).populate('lot').lean();

    // OPTIMIZATION: Get all quotas for all contracts in ONE query
    const contractIds = contracts.map(c => c._id);
    const allQuotas = await Quota.find({ contract: { $in: contractIds } })
      .sort({ type: 1, number: 1 })
      .lean();

    const contractsWithQuotas = contracts.map((contract) => {
      const contractQuotas = allQuotas.filter(q => q.contract.toString() === contract._id.toString());
      
      return {
        ...contract,
        quotas: contractQuotas.map((q) => ({
          _id: q._id,
          number: q.number,
          type: q.type,
          value: q.value,
          dueDate: q.dueDate,
          status: q.status,
        })),
      };
    });

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
    const { quotaId, amount, bank, observations, paymentDate, fechaPago, paymentMethod, phone, email } = req.body;
    
    if (bank === 'Cruce de cuentas' || paymentMethod === 'Cruce de cuentas') {
      return next(new AppError('No tienes permiso para reportar pagos con cruce de cuentas', 403));
    }
    const file = req.file;

    console.log('[LOG][PUBLIC_REPORT_PAYMENT] Petición recibida:', {
      quotaId,
      amount,
      bank,
      observations,
      paymentDate,
      fechaPago,
      paymentMethod,
      phone,
      email,
      hasFile: !!file
    });

    if (!quotaId) {
      console.warn('[LOG][PUBLIC_REPORT_PAYMENT] Error: ID de cuota ausente');
      return next(new AppError('El ID de la cuota es requerido', 400));
    }

    const quota = await Quota.findById(quotaId);
    if (!quota) {
      console.warn('[LOG][PUBLIC_REPORT_PAYMENT] Error: Cuota no encontrada con ID:', quotaId);
      return next(new AppError('Cuota no encontrada', 404));
    }

    console.log('[LOG][PUBLIC_REPORT_PAYMENT] Cuota encontrada antes de actualizar:', {
      quotaId: quota._id,
      contract: quota.contract,
      number: quota.number,
      value: quota.value,
      amountPaid: quota.amountPaid,
      status: quota.status,
      prevPaymentDate: quota.paymentDate
    });

    let captureUrl = null;
    if (file) {
      captureUrl = await uploadToR2(file, 'payments');
      console.log('[LOG][PUBLIC_REPORT_PAYMENT] Archivo subido exitosamente:', captureUrl);
    }

    const targetDate = paymentDate || fechaPago || new Date();
    console.log('[LOG][PUBLIC_REPORT_PAYMENT] Fecha determinada para el pago:', targetDate);

    // Update quota with pending payment info
    // Client payments are always PENDING
    quota.status = 'pendiente'; 
    quota.amountPaid = amount || quota.value;
    quota.paymentBank = bank;
    quota.paymentMethod = paymentMethod;
    quota.paymentObservations = observations;
    quota.paymentDate = targetDate;
    if (captureUrl) {
      quota.paymentCapture = captureUrl;
    }

    await quota.save();
    console.log('[LOG][PUBLIC_REPORT_PAYMENT] Cuota guardada exitosamente con ID:', quota._id);

    // Update client contact info if provided
    try {
      const contract = await Contract.findById(quota.contract);
      if (contract) {
        console.log('[LOG][PUBLIC_REPORT_PAYMENT] Contrato relacionado:', {
          contractId: contract._id,
          clientId: contract.client
        });
        const client = await Client.findById(contract.client);
        if (client) {
          let updated = false;
          if (phone && phone !== client.phone) {
            console.log(`[LOG][PUBLIC_REPORT_PAYMENT] Actualizando teléfono de ${client.phone} a ${phone}`);
            client.phone = phone;
            updated = true;
          }
          if (email && email !== client.email) {
            console.log(`[LOG][PUBLIC_REPORT_PAYMENT] Actualizando email de ${client.email} a ${email}`);
            client.email = email;
            updated = true;
          }
          if (updated) {
            await client.save();
            console.log('[LOG][PUBLIC_REPORT_PAYMENT] Información del cliente actualizada exitosamente');
          }
        }
      }
    } catch (err) {
      console.error('[LOG][PUBLIC_REPORT_PAYMENT] Error updating client info during payment report:', err);
      // We don't block the payment report if client update fails
    }

    res.json({
      success: true,
      message: 'Pago reportado exitosamente. Pendiente de aprobación.',
    });
  } catch (error) {
    console.error('[LOG][PUBLIC_REPORT_PAYMENT] Error crítico:', error);
    next(error);
  }
};

/**
 * Get active company bank accounts with QR codes (Public endpoint)
 */
export const getCompanyAccountsPublic = async (req, res, next) => {
  try {
    const { companySlug } = req.params;

    const company = await Company.findOne({ slug: companySlug }).select('name logo nit address phone bankAccounts');
    if (!company) {
      return next(new AppError('Empresa no encontrada', 404));
    }

    res.json({
      success: true,
      data: {
        name: company.name,
        logo: company.logo || '',
        nit: company.nit || '',
        address: company.address || '',
        phone: company.phone || '',
        bankAccounts: company.bankAccounts ? company.bankAccounts.filter(acc => acc.isActive) : []
      }
    });
  } catch (error) {
    next(error);
  }
};
