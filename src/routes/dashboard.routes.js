import express from 'express';
import Client from '../models/Client.js';
import Contract from '../models/Contract.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/summary', protect, async (req, res) => {
  try {
    // Get total clients count
    const totalClientsCount = await Client.countDocuments();
    
    // Get portfolio total
    const portfolioTotal = await Contract.aggregate([
      { $group: { _id: null, total: { $sum: '$totalValue' } } },
    ]);

    res.json({
      success: true,
      data: {
        totalClients: totalClientsCount,
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
