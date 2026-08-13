import express from 'express';
import mongoose from 'mongoose';
import Escalation from '../models/Escalation.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

/**
 * GET /api/escalations?companyId=xxx&estado=pendiente&page=1&limit=20
 * Cola de llamadas agendadas para asesores humanos.
 */
router.get('/', companyMiddleware, async (req, res) => {
  try {
    const { tenantId, companyId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { tenantId, companyId };
    if (req.query.estado && req.query.estado !== 'ALL') {
      filter.estado = req.query.estado;
    }

    const [escalations, total] = await Promise.all([
      Escalation.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('client', 'name idNumber phone'),
      Escalation.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { escalations, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error listando escalamientos:', error);
    res.status(500).json({ error: 'Ocurrió un error al listar los escalamientos.' });
  }
});

/**
 * PATCH /api/escalations/:id/estado?companyId=xxx
 * Cambia el estado de un escalamiento: pendiente -> en_proceso -> resuelto.
 */
router.patch('/:id/estado', companyMiddleware, async (req, res) => {
  try {
    const { tenantId, companyId } = req.user;
    const { estado } = req.body;

    if (!['pendiente', 'en_proceso', 'resuelto'].includes(estado)) {
      return res.status(400).json({ error: 'Estado no válido.' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID no válido.' });
    }

    const escalation = await Escalation.findOneAndUpdate(
      { _id: req.params.id, tenantId, companyId },
      { estado },
      { new: true },
    );

    if (!escalation) {
      return res.status(404).json({ error: 'Escalamiento no encontrado.' });
    }

    res.json({ success: true, data: { escalation } });
  } catch (error) {
    console.error('Error actualizando escalamiento:', error);
    res.status(500).json({ error: 'Ocurrió un error al actualizar el escalamiento.' });
  }
});

export default router;
