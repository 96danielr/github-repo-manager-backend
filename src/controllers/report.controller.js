import mongoose from 'mongoose';
import Contract from '../models/Contract.js';
import Lot from '../models/Lot.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import Quota from '../models/Quota.js';
import Client from '../models/Client.js';
import Commission from '../models/Commission.js';
import AppError from '../utils/AppError.js';

/**
 * Generates a sales report including monthly sales, top advisor, 
 * reserved lots, and detailed status per stage.
 */
export const getSalesReport = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Sales this month
    const salesThisMonth = await Contract.countDocuments({
      tenantId,
      companyId,
      contractDate: { $gte: startOfMonth, $lte: endOfMonth }
    });

    // 2. Top Advisor
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
      topAdvisor = await User.findById(topAdvisorAggregate[0]._id)
        .populate({
          path: 'accountId',
          select: 'fullName'
        });
    }

    // 3. Separated lots
    const separatedLots = await Lot.countDocuments({
      tenantId,
      companyId,
      status: 'separado'
    });

    // 4. Detailed lots stats by Stage
    const lotStats = await Lot.aggregate([
      { 
        $match: { 
          tenantId: new mongoose.Types.ObjectId(tenantId), 
          companyId: new mongoose.Types.ObjectId(companyId) 
        } 
      },
      {
        $group: {
          _id: '$stage',
          total: { $sum: 1 },
          vendidos: { $sum: { $cond: [{ $eq: ['$status', 'vendido'] }, 1, 0] } },
          disponibles: { $sum: { $cond: [{ $eq: ['$status', 'disponible'] }, 1, 0] } },
          separados: { $sum: { $cond: [{ $eq: ['$status', 'separado'] }, 1, 0] } },
          apartados: { $sum: { $cond: [{ $eq: ['$status', 'apartado'] }, 1, 0] } },
        }
      },
      {
        $project: {
          stage: '$_id',
          total: 1,
          vendidos: 1,
          disponibles: 1,
          separados: 1,
          apartados: 1,
          porcentajeVendido: {
            $cond: [
              { $gt: ['$total', 0] },
              { $multiply: [{ $divide: ['$vendidos', '$total'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { stage: 1 } }
    ]);

    // Get project name
    const company = await Company.findById(companyId).select('name');

    res.status(200).json({
      success: true,
      data: {
        salesThisMonth,
        topAdvisor: topAdvisor ? {
          id: topAdvisor._id,
          name: topAdvisor.accountId?.fullName || 'N/A',
          count: topAdvisorAggregate[0].count
        } : null,
        separatedLots,
        lotStats: lotStats.map(stat => ({
          ...stat,
          projectName: company ? company.name : 'Proyecto Desconocido'
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Projects expected revenue for the next N months based on pending quotas.
 */
export const getCashFlowProjection = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { months = 6 } = req.query;

    const now = new Date();
    // Start from the beginning of the current month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endProjection = new Date(now.getFullYear(), now.getMonth() + parseInt(months), 0, 23, 59, 59);

    const projection = await Quota.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId),
          status: { $in: ['pendiente', 'mora'] },
          dueDate: { $gte: startOfCurrentMonth, $lte: endProjection }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$dueDate' },
            month: { $month: '$dueDate' }
          },
          expectedAmount: { $sum: '$value' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          expectedAmount: 1,
          count: 1
        }
      },
      { $sort: { year: 1, month: 1 } }
    ]);

    // Fill missing months with 0 to ensure the chart looks continuous
    const formattedProjection = [];
    for (let i = 0; i < parseInt(months); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // JS months are 0-11, MongoDB 1-12

      const existingMonth = projection.find(p => p.year === year && p.month === month);
      
      formattedProjection.push({
        year,
        month,
        monthName: d.toLocaleString('es-ES', { month: 'short' }).toUpperCase(),
        label: `${d.toLocaleString('es-ES', { month: 'short' })} ${year.toString().slice(-2)}`,
        expectedAmount: existingMonth ? existingMonth.expectedAmount : 0,
        count: existingMonth ? existingMonth.count : 0
      });
    }

    res.status(200).json({
      success: true,
      data: formattedProjection
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generates advanced reports: aging portfolio (30/60/90 days),
 * monthly expected vs. actual collected, and top delinquent / best behavior clients.
 */
export const getAdvancedReports = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const now = new Date();
    const { startDate, endDate } = req.query;

    let startInterval = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    let endInterval = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // ==========================================
    // 1. CARTERA POR EDADES & AL DIA
    // ==========================================
    const unpaidQuotas = await Quota.find({
      tenantId,
      companyId,
      status: { $in: ['pendiente', 'mora'] }
    });

    const aging = {
      bucket30: { amount: 0, count: 0 }, // 1-30 days
      bucket60: { amount: 0, count: 0 }, // 31-60 days
      bucket90: { amount: 0, count: 0 }, // 61-90 days
      bucketOver90: { amount: 0, count: 0 } // > 90 days
    };

    const carteraAlDia = { amount: 0, count: 0 };

    unpaidQuotas.forEach(q => {
      const remainingVal = q.value - (q.amountPaid || 0);
      if (q.dueDate < now) {
        const diffTime = Math.abs(now - q.dueDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          aging.bucket30.amount += remainingVal;
          aging.bucket30.count += 1;
        } else if (diffDays <= 60) {
          aging.bucket60.amount += remainingVal;
          aging.bucket60.count += 1;
        } else if (diffDays <= 90) {
          aging.bucket90.amount += remainingVal;
          aging.bucket90.count += 1;
        } else {
          aging.bucketOver90.amount += remainingVal;
          aging.bucketOver90.count += 1;
        }
      } else {
        carteraAlDia.amount += remainingVal;
        carteraAlDia.count += 1;
      }
    });

    // ==========================================
    // 1B. RECAUDOS (All time, Today, Interval)
    // ==========================================
    const paidQuotasAllTime = await Quota.find({
      tenantId,
      companyId,
      status: 'pagado'
    });
    const totalCollected = paidQuotasAllTime.reduce((sum, q) => sum + (q.amountPaid || q.value), 0);

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const paidQuotasToday = await Quota.find({
      tenantId,
      companyId,
      status: 'pagado',
      paymentDate: { $gte: startOfToday, $lte: endOfToday }
    });
    const collectedToday = paidQuotasToday.reduce((sum, q) => sum + (q.amountPaid || q.value), 0);

    const paidQuotasInterval = await Quota.find({
      tenantId,
      companyId,
      status: 'pagado',
      paymentDate: { $gte: startInterval, $lte: endInterval }
    });
    const collectedInterval = paidQuotasInterval.reduce((sum, q) => sum + (q.amountPaid || q.value), 0);

    const recaudos = {
      totalCollected,
      collectedToday,
      collectedInterval,
      startInterval,
      endInterval
    };

    // ==========================================
    // 2. ESPERADO VS RECAUDADO POR MES (Expected vs. Real Revenue)
    // ==========================================
    // We look at the last 6 months
    const comparison = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      // Expected: quotas with dueDate in this month
      const expectedQuotas = await Quota.find({
        tenantId,
        companyId,
        dueDate: { $gte: startOfMonth, $lte: endOfMonth }
      });
      const expectedAmount = expectedQuotas.reduce((sum, q) => sum + q.value, 0);

      // Real: quotas with paymentDate in this month and status is 'pagado'
      const realQuotas = await Quota.find({
        tenantId,
        companyId,
        status: 'pagado',
        paymentDate: { $gte: startOfMonth, $lte: endOfMonth }
      });
      const realAmount = realQuotas.reduce((sum, q) => sum + (q.amountPaid || q.value), 0);

      comparison.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        monthName: d.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase(),
        label: `${d.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase()} ${d.getFullYear()}`,
        expectedAmount,
        realAmount
      });
    }

    // ==========================================
    // 3. RANKING DE CLIENTES (Morosos vs. Cumplidos)
    // ==========================================
    // A. Clientes más morosos (Most Delinquent)
    const delinquentContractsAggregate = await Quota.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId),
          status: { $in: ['pendiente', 'mora'] },
          dueDate: { $lt: now }
        }
      },
      {
        $group: {
          _id: '$contract',
          lateAmount: { $sum: { $subtract: ['$value', { $ifNull: ['$amountPaid', 0] }] } },
          lateQuotasCount: { $sum: 1 }
        }
      },
      { $sort: { lateAmount: -1 } },
      { $limit: 10 }
    ]);

    const delinquentClients = [];
    for (const item of delinquentContractsAggregate) {
      const contract = await Contract.findById(item._id)
        .populate({ path: 'client', select: 'name idNumber phone email' })
        .populate({ path: 'lot', select: 'number stage manzana nomenclatura' });
      
      if (contract && contract.client) {
        delinquentClients.push({
          clientId: contract.client._id,
          clientName: contract.client.name,
          clientDocument: contract.client.idNumber,
          lotNumber: contract.lot ? contract.lot.number : 'N/A',
          lotStage: contract.lot ? contract.lot.stage : 'N/A',
          lateAmount: item.lateAmount,
          lateQuotasCount: item.lateQuotasCount
        });
      }
    }

    // B. Clientes con mejor comportamiento (Best paying clients)
    // We look at contracts that have paid quotas
    const behaviorContractsAggregate = await Quota.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId)
        }
      },
      {
        $group: {
          _id: '$contract',
          totalQuotasCount: { $sum: 1 },
          paidQuotasCount: { $sum: { $cond: [{ $eq: ['$status', 'pagado'] }, 1, 0] } },
          onTimePaidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'pagado'] },
                    { $lte: ['$paymentDate', '$dueDate'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          totalPaidAmount: { $sum: { $cond: [{ $eq: ['$status', 'pagado'] }, { $ifNull: ['$amountPaid', '$value'] }, 0] } }
        }
      },
      {
        $project: {
          totalQuotasCount: 1,
          paidQuotasCount: 1,
          onTimePaidCount: 1,
          totalPaidAmount: 1,
          onTimeRate: {
            $cond: [
              { $gt: ['$paidQuotasCount', 0] },
              { $multiply: [{ $divide: ['$onTimePaidCount', '$paidQuotasCount'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { onTimeRate: -1, totalPaidAmount: -1 } },
      { $limit: 10 }
    ]);

    const bestClients = [];
    for (const item of behaviorContractsAggregate) {
      if (item.paidQuotasCount === 0) continue; // Skip contracts with no payments
      const contract = await Contract.findById(item._id)
        .populate({ path: 'client', select: 'name idNumber phone email' })
        .populate({ path: 'lot', select: 'number stage' });

      if (contract && contract.client) {
        bestClients.push({
          clientId: contract.client._id,
          clientName: contract.client.name,
          clientDocument: contract.client.idNumber,
          lotNumber: contract.lot ? contract.lot.number : 'N/A',
          lotStage: contract.lot ? contract.lot.stage : 'N/A',
          onTimeRate: item.onTimeRate,
          paidQuotasCount: item.paidQuotasCount,
          totalPaidAmount: item.totalPaidAmount
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        aging,
        carteraAlDia,
        recaudos,
        comparison,
        delinquentClients,
        bestClients
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sales report per advisor: sales, amounts sold, and collection on those sales.
 * Supports optional from/to date range (default: current month).
 */
export const getAdvisorReport = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { from, to } = req.query;

    const now = new Date();
    const startPeriod = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    let endPeriod = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    if (Number.isNaN(startPeriod.getTime())) {
      return next(new AppError('Fecha inicial inválida', 400));
    }
    if (Number.isNaN(endPeriod.getTime())) {
      return next(new AppError('Fecha final inválida', 400));
    }
    if (endPeriod < startPeriod) {
      return next(new AppError('La fecha final no puede ser anterior a la inicial', 400));
    }
    // Include the whole "to" day
    endPeriod = new Date(endPeriod);
    endPeriod.setHours(23, 59, 59, 999);

    // 1. Sales per advisor in the period
    const contractAgg = await Contract.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId),
          contractDate: { $gte: startPeriod, $lte: endPeriod },
        },
      },
      {
        $group: {
          _id: '$sellerId',
          ventas: { $sum: 1 },
          valorVendido: { $sum: { $ifNull: ['$totalValue', 0] } },
        },
      },
    ]);

    const sellerIds = contractAgg.map((c) => c._id).filter(Boolean);

    // 2. Collection per advisor over the same contracts
    const quotaAgg = await Quota.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId),
        },
      },
      {
        $lookup: {
          from: 'contracts',
          localField: 'contract',
          foreignField: '_id',
          as: 'contractData',
        },
      },
      { $unwind: '$contractData' },
      { $match: { 'contractData.sellerId': { $in: sellerIds } } },
      {
        $group: {
          _id: '$contractData.sellerId',
          recaudo: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pagado'] }, { $ifNull: ['$amountPaid', '$value'] }, 0],
            },
          },
          recaudoInicial: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'pagado'] }, { $eq: ['$type', 'inicial'] }] },
                { $ifNull: ['$amountPaid', '$value'] },
                0,
              ],
            },
          },
          valorInicialTotal: {
            $sum: { $cond: [{ $eq: ['$type', 'inicial'] }, '$value', 0] },
          },
        },
      },
    ]);

    const quotaBySeller = new Map(quotaAgg.map((q) => [q._id?.toString(), q]));

    // 2B. Commission progress per advisor (for the sales of the period)
    const contractIds = await Contract.distinct('_id', {
      tenantId,
      companyId,
      contractDate: { $gte: startPeriod, $lte: endPeriod },
    });
    const commissionAgg = await Commission.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          companyId: new mongoose.Types.ObjectId(companyId),
          contractId: { $in: contractIds },
        },
      },
      { $unwind: '$installments' },
      {
        $group: {
          _id: '$sellerId',
          comisionGenerada: { $sum: '$installments.amount' },
          comisionDisponible: {
            $sum: { $cond: [{ $eq: ['$installments.status', 'AVAILABLE'] }, '$installments.amount', 0] },
          },
          comisionRadicada: {
            $sum: { $cond: [{ $eq: ['$installments.status', 'FILED'] }, '$installments.amount', 0] },
          },
          comisionAprobada: {
            $sum: { $cond: [{ $eq: ['$installments.status', 'APPROVED'] }, '$installments.amount', 0] },
          },
          comisionPagada: {
            $sum: { $cond: [{ $eq: ['$installments.status', 'PAID'] }, '$installments.amount', 0] },
          },
        },
      },
    ]);
    const commissionBySeller = new Map(commissionAgg.map((c) => [c._id?.toString(), c]));

    // 3. Advisor names
    const advisorUsers = await User.find({ _id: { $in: sellerIds }, tenantId }).populate({
      path: 'accountId',
      select: 'fullName email',
    });
    const advisorMap = new Map(advisorUsers.map((u) => [u._id.toString(), u]));

    // 4. Build rows (contracts without sellerId appear as "Sin asesor")
    const advisors = contractAgg
      .map((item) => {
        const quota = quotaBySeller.get(item._id?.toString()) || {};
        const commission = commissionBySeller.get(item._id?.toString()) || {};
        const advisor = item._id ? advisorMap.get(item._id.toString()) : null;
        return {
          advisorId: item._id,
          name: advisor?.accountId?.fullName || 'Sin asesor',
          email: advisor?.accountId?.email || '',
          ventas: item.ventas,
          valorVendido: Math.round(item.valorVendido),
          recaudo: Math.round(quota.recaudo || 0),
          recaudoInicial: Math.round(quota.recaudoInicial || 0),
          valorInicialTotal: Math.round(quota.valorInicialTotal || 0),
          comisionGenerada: Math.round(commission.comisionGenerada || 0),
          comisionDisponible: Math.round(commission.comisionDisponible || 0),
          comisionRadicada: Math.round(commission.comisionRadicada || 0),
          comisionAprobada: Math.round(commission.comisionAprobada || 0),
          comisionPagada: Math.round(commission.comisionPagada || 0),
        };
      })
      .sort((a, b) => b.valorVendido - a.valorVendido);

    const totals = advisors.reduce(
      (acc, a) => {
        acc.ventas += a.ventas;
        acc.valorVendido += a.valorVendido;
        acc.recaudo += a.recaudo;
        acc.recaudoInicial += a.recaudoInicial;
        acc.valorInicialTotal += a.valorInicialTotal;
        acc.comisionGenerada += a.comisionGenerada;
        acc.comisionDisponible += a.comisionDisponible;
        acc.comisionRadicada += a.comisionRadicada;
        acc.comisionAprobada += a.comisionAprobada;
        acc.comisionPagada += a.comisionPagada;
        return acc;
      },
      { ventas: 0, valorVendido: 0, recaudo: 0, recaudoInicial: 0, valorInicialTotal: 0,
        comisionGenerada: 0, comisionDisponible: 0, comisionRadicada: 0, comisionAprobada: 0, comisionPagada: 0 }
    );

    res.status(200).json({
      success: true,
      data: {
        advisors,
        totals,
        from: startPeriod,
        to: endPeriod,
      },
    });
  } catch (error) {
    next(error);
  }
};
