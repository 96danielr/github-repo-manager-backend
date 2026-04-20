import Lot from '../models/Lot.js';
import { logAudit } from './auditLogger.js';

/**
 * Checks for expired reservations (apartado and separado) and releases them.
 * - 'apartado': maximum 5 days.
 * - 'separado': maximum 1 month (30 days).
 */
export const checkLotExpirations = async (tenantId, companyId) => {
  try {
    const now = new Date();
    
    // 1. Release 'apartado' lots older than 5 days
    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const expiredApartados = await Lot.find({
      tenantId,
      companyId,
      status: 'apartado',
      reservedAt: { $lt: fiveDaysAgo },
    });

    for (const lot of expiredApartados) {
      const oldReservedBy = lot.reservationBy;
      lot.status = 'disponible';
      lot.reservedAt = undefined;
      lot.reservationBy = undefined;
      await lot.save();

      // Log the automatic release
      await logAudit({ tenant: { id: tenantId, companyId, role: 'system' } }, {
        action: 'AUTO_RELEASE_LOT',
        module: 'LOTS',
        targetId: lot._id,
        details: { 
          reason: 'Apartado expired (5 days)', 
          previousStatus: 'apartado',
          client: oldReservedBy
        }
      });
    }

    // 2. Release 'separado' lots older than 1 month (30 days)
    // The user mentioned: "este tiene una validez hasta de 1 mes"
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const expiredSeparados = await Lot.find({
      tenantId,
      companyId,
      status: 'separado',
      reservedAt: { $lt: oneMonthAgo },
    });

    for (const lot of expiredSeparados) {
      const oldReservedBy = lot.reservationBy;
      lot.status = 'disponible';
      lot.reservedAt = undefined;
      lot.reservationBy = undefined;
      await lot.save();

      await logAudit({ tenant: { id: tenantId, companyId, role: 'system' } }, {
        action: 'AUTO_RELEASE_LOT',
        module: 'LOTS',
        targetId: lot._id,
        details: { 
          reason: 'Separado expired (1 month)', 
          previousStatus: 'separado',
          client: oldReservedBy
        }
      });
    }

    return {
      releasedApartados: expiredApartados.length,
      releasedSeparados: expiredSeparados.length,
    };
  } catch (error) {
    console.error('Error in checkLotExpirations:', error);
    return { error: error.message };
  }
};
