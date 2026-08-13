import express from 'express';
import KnowledgeBase from '../models/KnowledgeBase.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

router.use(protect);
router.use(tenantMiddleware);

/**
 * GET /api/knowledge?companyId=xxx&categoria=pagos&search=...
 * Lista la base de conocimiento de la empresa (solo activas o todas con includeInactive).
 */
router.get('/', companyMiddleware, async (req, res) => {
  try {
    const { tenantId, companyId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { tenantId, companyId };

    if (req.query.categoria && req.query.categoria !== 'ALL') {
      filter.categoria = req.query.categoria;
    }
    if (req.query.activo !== undefined && req.query.activo !== 'ALL') {
      filter.activo = req.query.activo === 'true';
    }
    if (req.query.search) {
      filter.$or = [
        { pregunta: { $regex: req.query.search, $options: 'i' } },
        { respuesta: { $regex: req.query.search, $options: 'i' } },
        { keywords: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [entries, total] = await Promise.all([
      KnowledgeBase.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      KnowledgeBase.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { entries, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error listando base de conocimiento:', error);
    res.status(500).json({ error: 'Ocurrió un error al listar la base de conocimiento.' });
  }
});

/**
 * POST /api/knowledge?companyId=xxx
 * Crea una entrada en la base de conocimiento de la empresa.
 */
router.post('/', companyMiddleware, async (req, res) => {
  try {
    const { tenantId, companyId } = req.user;
    const { pregunta, respuesta, keywords, categoria, activo } = req.body;

    if (!pregunta || !respuesta) {
      return res.status(400).json({ error: 'Los campos pregunta y respuesta son requeridos.' });
    }

    const entry = await KnowledgeBase.create({
      tenantId,
      companyId,
      pregunta,
      respuesta,
      keywords: Array.isArray(keywords) ? keywords : [],
      categoria: categoria || 'general',
      activo: activo !== undefined ? activo : true,
    });

    res.status(201).json({ success: true, data: { entry } });
  } catch (error) {
    console.error('Error creando entrada de conocimiento:', error);
    res.status(500).json({ error: 'Ocurrió un error al crear la entrada.' });
  }
});

/**
 * PUT /api/knowledge/:id?companyId=xxx
 * Actualiza una entrada de la empresa.
 */
router.put('/:id', companyMiddleware, async (req, res) => {
  try {
    const { tenantId, companyId } = req.user;
    const entry = await KnowledgeBase.findOne({ _id: req.params.id, tenantId, companyId });

    if (!entry) {
      return res.status(404).json({ error: 'Entrada no encontrada.' });
    }

    const { pregunta, respuesta, keywords, categoria, activo } = req.body;
    if (pregunta !== undefined) entry.pregunta = pregunta;
    if (respuesta !== undefined) entry.respuesta = respuesta;
    if (keywords !== undefined) entry.keywords = Array.isArray(keywords) ? keywords : [];
    if (categoria !== undefined) entry.categoria = categoria;
    if (activo !== undefined) entry.activo = activo;

    await entry.save();
    res.json({ success: true, data: { entry } });
  } catch (error) {
    console.error('Error actualizando entrada de conocimiento:', error);
    res.status(500).json({ error: 'Ocurrió un error al actualizar la entrada.' });
  }
});

/**
 * DELETE /api/knowledge/:id?companyId=xxx
 * Elimina una entrada de la empresa.
 */
router.delete('/:id', companyMiddleware, async (req, res) => {
  try {
    const { tenantId, companyId } = req.user;
    const entry = await KnowledgeBase.findOneAndDelete({ _id: req.params.id, tenantId, companyId });

    if (!entry) {
      return res.status(404).json({ error: 'Entrada no encontrada.' });
    }

    res.json({ success: true, message: 'Entrada eliminada correctamente.' });
  } catch (error) {
    console.error('Error eliminando entrada de conocimiento:', error);
    res.status(500).json({ error: 'Ocurrió un error al eliminar la entrada.' });
  }
});

export default router;
