import express from 'express';
import Contract from '../models/Contract.js';
import User from '../models/User.js';
import Lot from '../models/Lot.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';
import mongoose from 'mongoose';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

// Dashboard summary — company-scoped
router.get('/summary', companyMiddleware, checkPermission(PERMISSIONS.CARTERA_DASHBOARD), async (req, res) => {
  try {
    const { tenantId, companyId, role, userId } = req.user;

    const baseMatch = { tenantId, companyId };
    if (role === 'vendedor' || role === 'ejecutivo_comercial' || role === 'agent') {
      baseMatch.sellerId = userId;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Top Advisor of the month
    const topAdvisorAggregate = await Contract.aggregate([
      { 
        $match: { 
          tenantId: new mongoose.Types.ObjectId(tenantId), 
          companyId: new mongoose.Types.ObjectId(companyId),
          contractDate: { $gte: startOfMonth, $lte: endOfMonth }
        } 
      },
      { $group: { _id: '$sellerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    let topAdvisor = null;
    if (topAdvisorAggregate.length > 0 && topAdvisorAggregate[0]._id) {
      const advisorUser = await User.findById(topAdvisorAggregate[0]._id)
        .populate({
          path: 'accountId',
          select: 'fullName'
        });
      
      if (advisorUser) {
        topAdvisor = {
          id: advisorUser._id,
          name: advisorUser.accountId?.fullName || 'N/A',
          count: topAdvisorAggregate[0].count
        };
      }
    }

    const totalClientsCount = await Contract.distinct('client', baseMatch).then((clients) => clients.length);

    // Calculate Portfolio / Project Stats
    const stats = await Contract.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: 'quotas',
          localField: '_id',
          foreignField: 'contract',
          as: 'quotas',
        },
      },
      {
        $addFields: {
          paidInQuotas: {
            $sum: {
              $map: {
                input: { $filter: { input: '$quotas', as: 'q', cond: { $eq: ['$$q.status', 'pagado'] } } },
                as: 'pq',
                in: '$$pq.value',
              },
            },
          },
          siigoTotal: { $add: ['$recaudadoSiigo2024', '$recaudadoSiigo2025'] },
        },
      },
      {
        $addFields: {
          realPaid: '$paidInQuotas',
        },
      },
      {
        $group: {
          _id: null,
          valorTotalCartera: { $sum: '$totalValue' },
          totalRecaudado: { $sum: '$realPaid' },
        },
      },
    ]);

    const result = stats[0] || { valorTotalCartera: 0, totalRecaudado: 0 };
    const totalPendiente = Math.max(0, result.valorTotalCartera - result.totalRecaudado);
    const porcentajeRecaudo = result.valorTotalCartera > 0 
      ? Math.round((result.totalRecaudado / result.valorTotalCartera) * 100) 
      : 0;

    const totalSalesCount = await Contract.countDocuments(baseMatch);
    const teamMembersCount = await User.countDocuments({ tenantId, status: 'active' });

    // Sales this month (scoped to the seller's own contracts for seller roles)
    const isSellerRole = role === 'vendedor' || role === 'ejecutivo_comercial' || role === 'agent';
    const salesThisMonthAgg = await Contract.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId),
          contractDate: { $gte: startOfMonth, $lte: endOfMonth },
          ...(isSellerRole ? { sellerId: new mongoose.Types.ObjectId(userId) } : {}),
        },
      },
      {
        $group: {
          _id: null,
          ventas: { $sum: 1 },
          valorVendido: { $sum: { $ifNull: ['$totalValue', 0] } },
        },
      },
    ]);
    const salesThisMonth = salesThisMonthAgg[0] || { ventas: 0, valorVendido: 0 };

    // 2. Lot Statistics
    const separatedLots = await Lot.countDocuments({ ...baseMatch, status: 'separado' });
    const soldLots = await Lot.countDocuments({ ...baseMatch, status: 'vendido' });
    const availableLots = await Lot.countDocuments({ ...baseMatch, status: 'disponible' });

    const lotStatsByStage = await Lot.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), companyId: new mongoose.Types.ObjectId(companyId) } },
      {
        $group: {
          _id: '$stage',
          total: { $sum: 1 },
          vendidos: { $sum: { $cond: [{ $eq: ['$status', 'vendido'] }, 1, 0] } },
          disponibles: { $sum: { $cond: [{ $eq: ['$status', 'disponible'] }, 1, 0] } },
          separados: { $sum: { $cond: [{ $eq: ['$status', 'separado'] }, 1, 0] } },
        }
      },
      {
        $project: {
          stage: '$_id',
          total: 1,
          vendidos: 1,
          disponibles: 1,
          separados: 1,
          porcentajeVendido: {
            $round: [{
              $cond: [
                { $gt: ['$total', 0] },
                { $multiply: [{ $divide: ['$vendidos', '$total'] }, 100] },
                0
              ]
            }, 0]
          }
        }
      },
      { $sort: { stage: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalClients: totalClientsCount,
        totalSales: totalSalesCount,
        teamMembers: teamMembersCount,
        isSeller: isSellerRole,
        salesThisMonth: {
          count: salesThisMonth.ventas,
          valorVendido: Math.round(salesThisMonth.valorVendido),
        },
        cartera: {
          valorTotalCartera: Math.round(result.valorTotalCartera),
          totalRecaudado: Math.round(result.totalRecaudado),
          totalPendiente: Math.round(totalPendiente),
          porcentajeRecaudo,
        },
        mora: {
          totalContratosActivos: totalSalesCount,
          contratosAlDia: 0,
          contratosMora1a15: 0,
          contratosMora16a30: 0,
          contratosMora31a60: 0,
          contratosMora60plus: 0,
          porcentajeMora: 0,
          dineroEnMora: 0,
        },
        recaudoMensual: {
          mesActual: 0,
          mesAnterior: 0,
          variacion: 0,
        },
        operacion: {
          comprobantesPendientes: 0,
          clientesEscalados: 0,
          whatsappEnviadosMes: 0,
          llamadasAIMes: 0,
        },
        topAdvisor,
        lotStats: {
          separated: separatedLots,
          sold: soldLots,
          available: availableLots,
          byStage: lotStatsByStage
        }
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/ranking-morosos', (req, res) => res.json({ success: true, data: [] }));
router.get('/recaudo-mensual', (req, res) => res.json({ success: true, data: { data: [] } }));
router.get('/comportamiento', (req, res) => res.json({ success: true, data: [] }));

export default router;
