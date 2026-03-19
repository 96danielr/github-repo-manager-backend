import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';
import Client from '../models/Client.js';
import AppError from '../utils/AppError.js';

/**
 * Get all quotas (payments) for a given company with server-side pagination and filtering.
 * Uses the Quota model since each quota represents a payment record.
 */
export const getPayments = async (req, res, next) => {
  try {
    const { id: tenantId, companyId } = req.tenant;
    const { page = 1, limit = 20, search, status } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Base filter by tenant and company
    let query = { tenantId, companyId };

    // Map frontend status names to Quota status values
    if (status && status !== 'ALL') {
      const statusMap = {
        'PENDIENTE': 'pendiente',
        'PAGADO': 'pagado',
        'MORA': 'mora',
      };
      query.status = statusMap[status] || status.toLowerCase();
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
      .sort({ dueDate: -1 })
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
        amount: qObj.value || 0,
        banco: 'N/A', // Quotas don't have bank info
        fechaPago: qObj.dueDate,
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
