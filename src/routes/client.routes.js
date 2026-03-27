import express from 'express';
import mongoose from 'mongoose';
import Client from '../models/Client.js';
import Contract from '../models/Contract.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

import Quota from '../models/Quota.js';

const router = express.Router();

// All client routes require auth + tenant
router.use(protect);
router.use(tenantMiddleware);

// Company-scoped: GET /clients?companyId=xxx
router.get('/', companyMiddleware, async (req, res) => {
  try {
    const { id: tenantId, companyId } = req.tenant;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy;
    const order = req.query.order;

    // Dynamic sort
    let sortObj = { createdAt: -1 };
    if (sortBy) {
      sortObj = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

    let matchQuery = { 
      tenantId: new mongoose.Types.ObjectId(tenantId), 
      companyId: new mongoose.Types.ObjectId(companyId), 
    };
    
    if (search) {
      matchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { idNumber: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const aggregatePipeline = [
      { $match: matchQuery },
      // Join with Contracts
      {
        $lookup: {
          from: 'contracts',
          localField: '_id',
          foreignField: 'client',
          as: 'contracts',
        },
      },
      // Join with Quotas (unwind contracts first to join, then group back)
      { $unwind: { path: '$contracts', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'quotas',
          let: { contractId: '$contracts._id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$contract', '$$contractId'] }, status: 'pagado' } },
          ],
          as: 'paidQuotas',
        },
      },
      {
        $addFields: {
          'contracts.totalPagadoQuotas': { $sum: '$paidQuotas.value' },
        },
      },
      {
        $addFields: {
          'contracts.realPaid': {
            $max: [
              '$contracts.totalPagadoQuotas',
              {
                $add: [
                  { $ifNull: ['$contracts.recaudadoSiigo2024', 0] },
                  { $ifNull: ['$contracts.recaudadoSiigo2025', 0] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$_id',
          name: { $first: '$name' },
          idNumber: { $first: '$idNumber' },
          phone: { $first: '$phone' },
          behavior: { $first: '$behavior' },
          createdAt: { $first: '$createdAt' },
          totalValue: { $sum: '$contracts.totalValue' },
          totalPaid: { $sum: '$contracts.realPaid' },
          contracts: { $push: '$contracts' },
        },
      },
      {
        $addFields: {
          totalContracts: {
            $cond: [
              { $eq: [{ $arrayElemAt: ['$contracts', 0] }, {}] },
              0,
              { $size: '$contracts' },
            ],
          },
          totalPending: { $subtract: ['$totalValue', '$totalPaid'] },
          porcentajeRecaudo: {
            $cond: [
              { $gt: ['$totalValue', 0] },
              { $multiply: [{ $divide: ['$totalPaid', '$totalValue'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: sortObj },
      { $skip: skip },
      { $limit: limit },
    ];

    const total = await Client.countDocuments(matchQuery);
    const clients = await Client.aggregate(aggregatePipeline);

    res.json({
      success: true,
      data: {
        clients,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /clients/:id - Detail with contracts
router.get('/:id', companyMiddleware, async (req, res) => {
  try {
    const { id: tenantId, companyId } = req.tenant;
    const { id } = req.params;

    const client = await Client.findOne({ _id: id, tenantId, companyId });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    }

    // Get contracts for this client
    const contracts = await Contract.find({ client: id, tenantId, companyId });
    
    // For each contract, get stats
    const contractsWithStats = await Promise.all(contracts.map(async (contract) => {
      const contractId = new mongoose.Types.ObjectId(contract._id);
      
      // Find all quotas for this contract
      const allQuotas = await Quota.find({ 
        contract: contractId, 
      });
      
      const initialQuotas = allQuotas.filter((q) => q.type === 'inicial');
      const normalQuotas = allQuotas.filter((q) => q.type === 'normal');

      const paidInitial = initialQuotas.filter((q) => q.status === 'pagado');
      const paidNormal = normalQuotas.filter((q) => q.status === 'pagado');
      
      const totalPagadoFromQuotas = allQuotas
        .filter((q) => q.status === 'pagado')
        .reduce((sum, q) => sum + (q.value || 0), 0);

      // Use the larger of: paid quotas total OR RECAUDADO SIIGO total.
      // Since the import marks quotas as 'pagado' based on RECAUDADO SIIGO data,
      // these should be equivalent. We use Math.max to account for any SIIGO 
      // remainder that didn't fully cover a quota (partial payment case).
      const totalRecaudadoSiigo = (contract.recaudadoSiigo2024 || 0) + 
                                  (contract.recaudadoSiigo2025 || 0);
      const totalPagado = Math.max(totalPagadoFromQuotas, totalRecaudadoSiigo);

      // Value breakdown
      const valorTotalInicial = initialQuotas.reduce((sum, q) => sum + (q.value || 0), 0);
      const valorPagadoInicial = paidInitial.reduce((sum, q) => sum + (q.value || 0), 0);
      const valorTotalCuotas = normalQuotas.reduce((sum, q) => sum + (q.value || 0), 0);
      const valorPagadoCuotas = paidNormal.reduce((sum, q) => sum + (q.value || 0), 0);

      return {
        ...contract.toObject(),
        totalPagado,
        valorTotalInicial,
        valorPagadoInicial,
        valorTotalCuotas,
        valorPagadoCuotas,
        // Detailed counts
        cuotasInicialesPagadas: paidInitial.length,
        totalCuotasIniciales: initialQuotas.length,
        cuotasNormalesPagadas: paidNormal.length,
        totalCuotasNormales: contract.installmentsCount || normalQuotas.length,
        // Legacy compatibility
        cuotasPagadas: paidNormal.length,
        totalCuotas: contract.installmentsCount || normalQuotas.length || 0,
        valorCuota: contract.installmentValue || 0,
        diasMora: 0, 
        status: 'ACTIVO',
      };
    }));

    res.json({
      success: true,
      data: {
        ...client.toObject(),
        contracts: contractsWithStats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
