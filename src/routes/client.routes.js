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
    const { id: tenantId, companyId, role, userId } = req.tenant;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy;
    const order = req.query.order;
    const behaviorFilter = req.query.behavior;
    const moraOnly = req.query.moraOnly === 'true';
    const alDiaOnly = req.query.alDiaOnly === 'true';

    // Dynamic sort
    let sortObj = { createdAt: -1 };
    if (sortBy) {
      sortObj = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

    let matchQuery = { 
      tenantId: new mongoose.Types.ObjectId(tenantId), 
      companyId: new mongoose.Types.ObjectId(companyId), 
    };

    if (role === 'vendedor') {
      const sellerClients = await Contract.find({ tenantId, companyId, sellerId: userId }).distinct('client');
      matchQuery.$or = [
        { _id: { $in: sellerClients } },
        { createdBy: new mongoose.Types.ObjectId(userId) },
      ];
    }
    
    if (search) {
      const searchFilter = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { idNumber: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      };

      if (matchQuery.$or) {
        // If we already have a role filter, wrap in $and
        const roleFilter = { $or: matchQuery.$or };
        delete matchQuery.$or;
        matchQuery.$and = [roleFilter, searchFilter];
      } else {
        matchQuery.$or = searchFilter.$or;
      }
    }

    if (behaviorFilter && behaviorFilter !== 'ALL') {
      matchQuery.behavior = behaviorFilter;
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
            { $match: { $expr: { $eq: ['$contract', '$$contractId'] } } },
          ],
          as: 'allQuotas',
        },
      },
      {
        $addFields: {
          'contracts.paidQuotas': {
            $filter: { input: '$allQuotas', as: 'q', cond: { $eq: ['$$q.status', 'pagado'] } },
          },
          'contracts.moraQuotas': {
            $filter: { input: '$allQuotas', as: 'q', cond: { $eq: ['$$q.status', 'mora'] } },
          },
        },
      },
      {
        $addFields: {
          'contracts.totalPagadoQuotas': { $sum: '$contracts.paidQuotas.value' },
          'contracts.hasMora': { $gt: [{ $size: '$contracts.moraQuotas' }, 0] },
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
          hasMora: { $max: '$contracts.hasMora' },
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
    ];

    if (moraOnly) {
      aggregatePipeline.push({ $match: { hasMora: true } });
    } else if (alDiaOnly) {
      aggregatePipeline.push({ $match: { totalContracts: { $gt: 0 }, hasMora: false } });
    }

    // Capture total for pagination before skip/limit
    const countPipeline = [...aggregatePipeline, { $count: 'total' }];
    const countResults = await Client.aggregate(countPipeline);
    const total = countResults[0]?.total || 0;

    // Apply sort, skip, limit
    aggregatePipeline.push({ $sort: sortObj });
    aggregatePipeline.push({ $skip: skip });
    aggregatePipeline.push({ $limit: limit });

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
    const { id: tenantId, companyId, role, userId } = req.tenant;
    const { id } = req.params;

    const query = { _id: id, tenantId, companyId };
    if (role === 'vendedor') {
      const hasContract = await Contract.exists({ client: id, sellerId: userId, tenantId, companyId });
      if (!hasContract) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para ver este cliente' });
      }
    }

    const client = await Client.findOne(query);
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
      }).sort({ type: 1, number: 1 });
      
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
        initialQuotaPercentage: contract.initialQuotaPercentage || (contract.totalValue > 0 ? (valorTotalInicial / contract.totalValue) * 100 : 0),
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
        quotas: allQuotas,
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

// POST /clients - Manual creation
router.post('/', companyMiddleware, async (req, res) => {
  try {
    const { id: tenantId, companyId, userId } = req.tenant;
    const { name, idNumber, phone, email, address, behavior } = req.body;

    if (!name || !idNumber) {
      return res.status(400).json({ success: false, message: 'Nombre y Cédula son obligatorios' });
    }

    // Check if client already exists in this company
    const existing = await Client.findOne({ idNumber, tenantId, companyId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe un cliente con esta cédula' });
    }

    const client = await Client.create({
      name,
      idNumber,
      phone,
      email,
      address,
      behavior: behavior || 'INDECISO',
      tenantId,
      companyId,
      createdBy: userId,
    });

    res.status(201).json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /clients/:id
router.delete('/:id', companyMiddleware, async (req, res) => {
  try {
    const { id: tenantId, companyId } = req.tenant;
    const { id } = req.params;

    const result = await Client.findOneAndDelete({ _id: id, tenantId, companyId });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    }

    res.json({ success: true, message: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
