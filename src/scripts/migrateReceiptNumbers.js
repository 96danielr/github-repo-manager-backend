import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PaymentAttempt from '../models/PaymentAttempt.js';
import Quota from '../models/Quota.js';
import Company from '../models/Company.js';
import Counter from '../models/Counter.js';

dotenv.config();

export async function migrateReceiptNumbers() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI no está definida en las variables de entorno');
  }

  console.log('[MIGRATION] Conectando a MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[MIGRATION] Conexión establecida.');

  const companies = await Company.find({}).lean();
  console.log(`[MIGRATION] Se encontraron ${companies.length} empresas para procesar.`);

  let grandTotalAttempts = 0;
  let grandTotalLegacyQuotas = 0;

  for (const company of companies) {
    const companyId = company._id;
    const tenantId = company.tenantId;

    console.log(`\n--------------------------------------------------`);
    console.log(`[MIGRATION] Procesando Empresa: "${company.name}" (ID: ${companyId})`);

    // 1. Obtener intentos de pago APROBADOS en orden cronológico
    const attempts = await PaymentAttempt.find({
      companyId,
      status: 'APROBADO',
    }).sort({ approvedAt: 1, createdAt: 1 }).lean();

    let currentSeq = 0;
    let attemptsMigrated = 0;

    if (attempts.length > 0) {
      const paBulkOps = [];
      const quotaBulkOps = [];

      for (const attempt of attempts) {
        currentSeq++;
        attemptsMigrated++;

        paBulkOps.push({
          updateOne: {
            filter: { _id: attempt._id },
            update: { $set: { receiptNumber: currentSeq } }
          }
        });

        const quotaIds = (attempt.quotas || []).map(q => q.quotaId).filter(Boolean);
        if (quotaIds.length > 0) {
          quotaBulkOps.push({
            updateMany: {
              filter: { _id: { $in: quotaIds } },
              update: { $set: { receiptNumber: currentSeq } }
            }
          });
        }
      }

      if (paBulkOps.length > 0) {
        await PaymentAttempt.bulkWrite(paBulkOps);
      }
      if (quotaBulkOps.length > 0) {
        await Quota.bulkWrite(quotaBulkOps);
      }
    }

    console.log(`[MIGRATION] -> ${attemptsMigrated} Intentos de Pago Aprobados migrados (consecutivos 1 a ${currentSeq}).`);

    // 2. Obtener cuotas pagadas legacy (sin PaymentAttempt asignado y sin receiptNumber)
    const allAttemptQuotaIds = await PaymentAttempt.distinct('quotas.quotaId', { companyId, status: 'APROBADO' });
    const legacyQuotas = await Quota.find({
      companyId,
      status: 'pagado',
      _id: { $nin: allAttemptQuotaIds },
      $or: [
        { receiptNumber: { $exists: false } },
        { receiptNumber: null }
      ]
    }).sort({ paymentDate: 1, updatedAt: 1 }).lean();

    let legacyMigrated = 0;
    if (legacyQuotas.length > 0) {
      const legacyBulkOps = [];
      for (const quota of legacyQuotas) {
        currentSeq++;
        legacyMigrated++;
        legacyBulkOps.push({
          updateOne: {
            filter: { _id: quota._id },
            update: { $set: { receiptNumber: currentSeq } }
          }
        });
      }
      if (legacyBulkOps.length > 0) {
        await Quota.bulkWrite(legacyBulkOps);
      }
      console.log(`[MIGRATION] -> ${legacyMigrated} Cuotas legacy pagadas migradas (consecutivos ${currentSeq - legacyMigrated + 1} a ${currentSeq}).`);
    }

    // 3. Sincronizar / Crear el registro en la colección Counter
    if (currentSeq > 0) {
      await Counter.findOneAndUpdate(
        { companyId, type: 'RECEIPT' },
        {
          $set: { seq: currentSeq, tenantId: tenantId || company.tenantId }
        },
        { upsert: true, new: true }
      );
      console.log(`[MIGRATION] -> Consecutivo final de Counter para "${company.name}": ${currentSeq}`);
    } else {
      console.log(`[MIGRATION] -> Sin recibos para "${company.name}". Counter se mantiene en 0.`);
    }

    grandTotalAttempts += attemptsMigrated;
    grandTotalLegacyQuotas += legacyMigrated;
  }

  console.log(`\n==================================================`);
  console.log(`[MIGRATION FINALIZADA CON ÉXITO]`);
  console.log(`Total Intentos de Pago migrados: ${grandTotalAttempts}`);
  console.log(`Total Cuotas Legacy migradas: ${grandTotalLegacyQuotas}`);
  console.log(`Total Recibos numerados: ${grandTotalAttempts + grandTotalLegacyQuotas}`);
  console.log(`==================================================\n`);
}

if (process.argv[1]?.endsWith('migrateReceiptNumbers.js')) {
  migrateReceiptNumbers()
    .then(() => {
      console.log('[MIGRATION] Proceso finalizado. Desconectando DB.');
      return mongoose.disconnect();
    })
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[MIGRATION ERROR]', err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
