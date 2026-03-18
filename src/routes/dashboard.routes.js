import express from 'express';
import Client from '../models/Client.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

// Dashboard summary — company-scoped
router.get('/summary', companyMiddleware, async (req, res) => {
  try {
    const { id: tenantId, companyId } = req.tenant;

    const totalClientsCount = await Client.countDocuments({ tenantId, companyId });

    const portfolioTotal = await Contract.aggregate([
      { $match: { tenantId, companyId } },
      { $group: { _id: null, total: { $sum: '$totalValue' } } },
    ]);

    // Count team members in this tenant (for tenant_admin dashboard)
    const teamMembersCount = await User.countDocuments({ tenantId, status: 'active' });

    res.json({
      success: true,
      data: {
        totalClients: totalClientsCount,
        teamMembers: teamMembersCount,
        cartera: {
          valorTotalCartera: portfolioTotal[0]?.total || 0,
          totalRecaudado: 0,
          totalPendiente: portfolioTotal[0]?.total || 0,
          porcentajeRecaudo: 0,
        },
        mora: {
          totalContratosActivos: 0,
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
