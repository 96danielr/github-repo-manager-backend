import mongoose from 'mongoose';
import Contract from '../models/Contract.js';
import Lot from '../models/Lot.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import Quota from '../models/Quota.js';

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
