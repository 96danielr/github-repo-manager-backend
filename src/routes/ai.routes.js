import express from 'express';
import Tenant from '../models/Tenant.js';
import Client from '../models/Client.js';
import Lot from '../models/Lot.js';
import Quota from '../models/Quota.js';
import Contract from '../models/Contract.js';

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

export default router;
