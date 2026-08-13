import express from 'express';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import Client from '../models/Client.js';
import Lot from '../models/Lot.js';
import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';
import CallLog from '../models/CallLog.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import Escalation from '../models/Escalation.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * Middleware para validar el token secreto enviado por ElevenLabs
 */
const verifyElevenLabsSecret = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-elevenlabs-secret'];
  const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET || 'secret_elevenlabs_super_seguro_123';

  // Si envías Bearer Token o X-Elevenlabs-Secret
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if ((bearerToken && bearerToken === expectedSecret) || secretHeader === expectedSecret) {
    return next();
  }

  return res.status(401).json({ error: 'No autorizado. Token de ElevenLabs inválido o ausente.' });
};

/**
 * POST /api/ai/agent-tools/consultar-cuotas
 * Endpoint invocado por la Tool de ElevenLabs para consultar estado general y próxima cuota
 */
router.post('/agent-tools/consultar-cuotas', verifyElevenLabsSecret, async (req, res) => {
  try {
    const { documento_identidad } = req.body;

    if (!documento_identidad) {
      return res.status(400).json({
        error: 'El campo documento_identidad es requerido.'
      });
    }

    // Buscamos el cliente por su documento (idNumber)
    const cliente = await Client.findOne({ idNumber: documento_identidad });

    if (!cliente) {
      return res.json({
        encontrado: false,
        mensaje: `No se encontró ningún cliente registrado con el documento ${documento_identidad}.`
      });
    }

    // Buscamos contratos asociados al cliente
    const contratos = await Contract.find({ client: cliente._id });
    const contractIds = contratos.map(c => c._id);

    // Consultamos las cuotas específicas de los contratos de este cliente
    let proximaCuota = null;
    try {
      proximaCuota = await Quota.findOne({
        contract: { $in: contractIds },
        status: { $in: ['pendiente', 'mora'] },
        dueDate: { $gte: new Date('2000-01-01') } // Ignora fechas corrompidas tipo 1900/1901
      }).sort({ dueDate: 1 });
    } catch (e) {
      console.warn('Error al buscar cuota en modelo Quota:', e.message);
    }

    // Buscamos los lotes o inmuebles asociados al cliente
    const lotes = await Lot.find({ clientId: cliente._id });

    let cuotasPendientes = 0;
    let montoDeuda = 0;

    lotes.forEach(lot => {
      if (lot.pendingAmount && lot.pendingAmount > 0) {
        montoDeuda += lot.pendingAmount;
        cuotasPendientes += lot.pendingInstallments || 1;
      }
    });

    const tieneDeuda = cuotasPendientes > 0 || (cliente.pendingAmount && cliente.pendingAmount > 0) || proximaCuota;
    const montoFinal = montoDeuda || (proximaCuota ? proximaCuota.value : cliente.pendingAmount) || 0;
    const cuotasFinales = cuotasPendientes || (proximaCuota ? 1 : cliente.pendingInstallments) || 0;

    const fechaVencimiento = proximaCuota && proximaCuota.dueDate 
      ? new Date(proximaCuota.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Próximamente';

    return res.json({
      encontrado: true,
      cliente: cliente.name,
      documento: cliente.idNumber,
      cuotas_pendientes: cuotasFinales,
      monto_total_deuda: montoFinal,
      moneda: cliente.currency || 'COP',
      proxima_cuota: proximaCuota ? {
        numero_cuota: proximaCuota.number,
        monto: proximaCuota.value,
        fecha_vencimiento: fechaVencimiento,
        estado: proximaCuota.status
      } : null,
      estado_cuenta: tieneDeuda ? 'CON_DEUDA' : 'AL_DIA',
      mensaje: tieneDeuda
        ? `El cliente ${cliente.name} registra cuotas pendientes. La próxima cuota vence el ${fechaVencimiento} por un valor de ${montoFinal} ${cliente.currency || 'COP'}.`
        : `El cliente ${cliente.name} se encuentra al día con todos sus pagos y no registra deuda.`
    });

  } catch (error) {
    console.error('Error en tool ElevenLabs consultar-cuotas:', error);
    return res.status(500).json({
      error: 'Ocurrió un error al consultar el estado de cuenta del cliente.'
    });
  }
});

/**
 * POST /api/ai/agent-tools/consultar-faq
 * Endpoint invocado por la Tool de ElevenLabs para responder dudas desde la base de conocimiento.
 * Nunca inventa respuestas: si no hay coincidencia, devuelve encontrado=false para que el agente escale.
 */
router.post('/agent-tools/consultar-faq', verifyElevenLabsSecret, async (req, res) => {
  try {
    const { pregunta, company_id } = req.body;

    if (!pregunta) {
      return res.status(400).json({
        error: 'El campo pregunta es requerido.'
      });
    }

    const filtro = { activo: true };
    if (company_id) {
      filtro.companyId = company_id;
    }

    const tokens = pregunta
      .toLowerCase()
      .replace(/[¿?¡!.,;:()]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);

    const regex = tokens.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

    const coincidencias = await KnowledgeBase.find({
      ...filtro,
      $or: [
        { pregunta: { $in: regex } },
        { respuesta: { $in: regex } },
        { keywords: { $in: tokens } },
      ],
    }).limit(3);

    // Preferimos la coincidencia con más tokens acertados
    const scored = coincidencias.map(entry => {
      const text = `${entry.pregunta} ${entry.keywords.join(' ')}`.toLowerCase();
      const score = tokens.filter(t => text.includes(t)).length;
      return { entry, score };
    });

    const mejor = scored.sort((a, b) => b.score - a.score)[0];

    if (!mejor || mejor.score === 0) {
      return res.json({
        encontrado: false,
        mensaje: `No encontré esa información en la base de conocimiento de la empresa. Recomiendo escalar la duda a un asesor.`,
      });
    }

    return res.json({
      encontrado: true,
      pregunta: mejor.entry.pregunta,
      respuesta: mejor.entry.respuesta,
      categoria: mejor.entry.categoria,
    });
  } catch (error) {
    console.error('Error en tool ElevenLabs consultar-faq:', error);
    return res.status(500).json({
      error: 'Ocurrió un error al consultar la base de conocimiento.'
    });
  }
});

/**
 * POST /api/ai/agent-tools/registrar-promesa
 * Tool de ElevenLabs: registra una fecha prometida de pago asociada a la conversación activa.
 * Si el CallLog de la conversación aún no existe (la llamada sigue activa), lo crea en estado in_progress;
 * el POST /api/ai/call-logs final lo completará con transcripción y duración.
 */
router.post('/agent-tools/registrar-promesa', verifyElevenLabsSecret, async (req, res) => {
  try {
    const { documento_identidad, conversation_id, fecha_prometida, monto, notas } = req.body;

    if (!documento_identidad) {
      return res.status(400).json({ error: 'El campo documento_identidad es requerido.' });
    }
    if (!conversation_id) {
      return res.status(400).json({ error: 'El campo conversation_id es requerido.' });
    }

    const cliente = await Client.findOne({ idNumber: documento_identidad });
    if (!cliente) {
      return res.json({
        registrado: false,
        mensaje: `No se encontró ningún cliente registrado con el documento ${documento_identidad}.`
      });
    }

    const paymentPromise = {
      promisedDate: fecha_prometida ? new Date(fecha_prometida) : null,
      amount: monto ? Number(monto) : undefined,
      notes: notas || undefined,
    };

    let callLog = await CallLog.findOne({ conversationId: conversation_id });

    if (callLog) {
      callLog.paymentPromise = {
        promisedDate: paymentPromise.promisedDate || callLog.paymentPromise?.promisedDate,
        amount: paymentPromise.amount ?? callLog.paymentPromise?.amount,
        notes: paymentPromise.notes ?? callLog.paymentPromise?.notes,
      };
      await callLog.save();
    } else {
      callLog = await CallLog.create({
        client: cliente._id,
        tenantId: cliente.tenantId,
        companyId: cliente.companyId,
        conversationId: conversation_id,
        intent: 'cobro',
        status: 'in_progress',
        paymentPromise,
      });
    }

    return res.json({
      registrado: true,
      mensaje: 'Promesa de pago registrada correctamente.',
      promesa: {
        fecha_prometida: paymentPromise.promisedDate,
        monto: paymentPromise.amount,
        notas: paymentPromise.notes,
      },
    });
  } catch (error) {
    console.error('Error en tool ElevenLabs registrar-promesa:', error);
    return res.status(500).json({ error: 'Ocurrió un error al registrar la promesa de pago.' });
  }
});

/**
 * POST /api/ai/agent-tools/escalar-asesor
 * Tool de ElevenLabs: agenda una llamada de un asesor humano para el cliente (cola de escalamientos).
 * Marca el CallLog de la conversación como escalated.
 */
router.post('/agent-tools/escalar-asesor', verifyElevenLabsSecret, async (req, res) => {
  try {
    const { documento_identidad, conversation_id, motivo } = req.body;

    if (!documento_identidad) {
      return res.status(400).json({ error: 'El campo documento_identidad es requerido.' });
    }
    if (!conversation_id) {
      return res.status(400).json({ error: 'El campo conversation_id es requerido.' });
    }

    const cliente = await Client.findOne({ idNumber: documento_identidad });
    if (!cliente) {
      return res.json({
        registrado: false,
        mensaje: `No se encontró ningún cliente registrado con el documento ${documento_identidad}.`
      });
    }

    let callLog = await CallLog.findOne({ conversationId: conversation_id });

    if (callLog) {
      callLog.escalated = true;
      await callLog.save();
    } else {
      callLog = await CallLog.create({
        client: cliente._id,
        tenantId: cliente.tenantId,
        companyId: cliente.companyId,
        conversationId: conversation_id,
        status: 'in_progress',
        escalated: true,
      });
    }

    const escalamiento = await Escalation.create({
      client: cliente._id,
      tenantId: cliente.tenantId,
      companyId: cliente.companyId,
      conversationId: conversation_id,
      callLog: callLog._id,
      motivo: motivo || 'Solicitud de contacto prioritario de un asesor',
      estado: 'pendiente',
    });

    return res.json({
      registrado: true,
      escalamientoId: escalamiento._id,
      mensaje: 'Solicitud registrada. Un asesor se comunicará con el cliente lo antes posible.',
    });
  } catch (error) {
    console.error('Error en tool ElevenLabs escalar-asesor:', error);
    return res.status(500).json({ error: 'Ocurrió un error al registrar el escalamiento.' });
  }
});

/**
 * POST /api/ai/call-logs
 * Guarda el registro de una llamada finalizada (llamado desde el frontend al colgar).
 * Upsert por conversationId para no duplicar registros parciales creados por las tools.
 */
router.post('/call-logs', protect, async (req, res) => {
  try {
    const {
      clientId,
      conversationId,
      intent,
      durationSeconds,
      status,
      transcript,
      paymentPromise,
    } = req.body;

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ error: 'El campo clientId es requerido y debe ser un ObjectId válido.' });
    }

    const cliente = await Client.findById(clientId);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    if (cliente.tenantId.toString() !== req.user.tenantId) {
      return res.status(403).json({ error: 'No tienes acceso a este cliente.' });
    }

    const updateData = {
      client: cliente._id,
      tenantId: cliente.tenantId,
      companyId: cliente.companyId,
      intent: intent || 'general',
      durationSeconds: Number(durationSeconds) || 0,
      status: status || 'completed',
      transcript: Array.isArray(transcript) ? transcript : [],
    };

    if (paymentPromise && (paymentPromise.promisedDate || paymentPromise.amount || paymentPromise.notes)) {
      updateData.paymentPromise = paymentPromise;
    }

    let callLog;
    if (conversationId) {
      callLog = await CallLog.findOneAndUpdate(
        { conversationId },
        { $set: updateData },
        { upsert: true, new: true }
      );
    } else {
      callLog = await CallLog.create(updateData);
    }

    res.status(201).json({ success: true, data: { callLog } });
  } catch (error) {
    console.error('Error guardando call log:', error);
    res.status(500).json({ error: 'Ocurrió un error al guardar el registro de la llamada.' });
  }
});

/**
 * GET /api/ai/call-logs/client/:clientId
 * Historial de llamadas de un cliente (autenticado con JWT, tal como está configurado).
 * Excluye registros en progreso (in_progress) que aún no terminaron.
 */
router.get('/call-logs/client/:clientId', protect, async (req, res) => {
  try {
    const { clientId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ error: 'clientId no válido.' });
    }

    const cliente = await Client.findById(clientId);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    if (cliente.tenantId.toString() !== req.user.tenantId) {
      return res.status(403).json({ error: 'No tienes acceso a este cliente.' });
    }

    const filter = { client: cliente._id, status: { $ne: 'in_progress' } };

    const [callLogs, total] = await Promise.all([
      CallLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('client', 'name idNumber phone'),
      CallLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        callLogs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error consultando call logs:', error);
    res.status(500).json({ error: 'Ocurrió un error al consultar el historial de llamadas.' });
  }
});

export default router;
