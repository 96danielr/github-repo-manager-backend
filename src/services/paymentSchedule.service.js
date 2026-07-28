import mongoose from 'mongoose';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';

/**
 * Simulates schedule adjustment without modifying the database.
 * Retains historical payments and computes projected remaining quotas.
 */
export async function simulateScheduleAdjustment({ contractId, tenantId, companyId, changes, strategy }) {
  const contract = await Contract.findOne({ _id: contractId, tenantId, companyId });
  if (!contract) {
    throw new Error('Contrato no encontrado');
  }

  const existingQuotas = await Quota.find({ contract: contractId, tenantId, companyId }).sort({ type: 1, number: 1 });

  // Compute contract values
  const totalValue = contract.totalValue || 0;
  const initialQuotas = existingQuotas.filter(q => q.type === 'inicial');
  const normalQuotas = existingQuotas.filter(q => q.type === 'normal');

  // Sum of initial quotas vs normal quotas
  const initialTotalPactado = initialQuotas.reduce((acc, q) => acc + (q.value || 0), 0);
  const normalTotalPactado = totalValue - initialTotalPactado;

  // Clone normal quotas for preview calculation
  let updatedNormalQuotas = normalQuotas.map(q => ({
    _id: q._id ? q._id.toString() : null,
    number: q.number,
    type: q.type,
    dueDate: q.dueDate,
    value: q.value,
    status: q.status,
    amountPaid: q.amountPaid || 0,
    isPaidOrPartial: q.status === 'pagado' || (q.amountPaid && q.amountPaid > 0),
  }));

  const warnings = [];

  // Apply target modifications passed in changes: { targetNumber, newValue, newDueDate }
  if (changes && Array.isArray(changes)) {
    for (const change of changes) {
      const idx = updatedNormalQuotas.findIndex(q => q.number === change.targetNumber);
      if (idx !== -1) {
        const targetQuota = updatedNormalQuotas[idx];
        if (targetQuota.isPaidOrPartial) {
          warnings.push(`La cuota #${targetQuota.number} tiene estado ${targetQuota.status} o abonado ($${targetQuota.amountPaid}). Se sugiere revisar el impacto en cuotas posteriores.`);
        }
        if (change.newValue !== undefined && change.newValue >= 0) {
          targetQuota.value = Number(change.newValue);
        }
        if (change.newDueDate) {
          targetQuota.dueDate = new Date(change.newDueDate);
        }
      }
    }
  }

  // Calculate sum of fixed / touched / paid cuotas vs remaining editable pending cuotas
  const totalPaidSoFar = existingQuotas.reduce((acc, q) => acc + (q.amountPaid || 0), 0);

  // Separate normal quotas into modified/fixed and editable pending
  const modifiedNumbers = new Set((changes || []).map(c => c.targetNumber));
  
  // Pending editable quotas (excluding paid and explicitly modified)
  const pendingEditable = updatedNormalQuotas.filter(q => !q.isPaidOrPartial && !modifiedNumbers.has(q.number));

  // Current total allocated across all quotas (initial + normal)
  let currentNormalSum = updatedNormalQuotas.reduce((acc, q) => acc + q.value, 0);
  let grandTotalAllocated = initialTotalPactado + currentNormalSum;
  let delta = grandTotalAllocated - totalValue; // > 0 means surplus (over allocated), < 0 means deficit (under allocated)

  if (Math.abs(delta) > 0.01 && strategy === 'REPARTIR_PENDIENTES') {
    if (pendingEditable.length > 0) {
      const adjustmentPerQuota = Math.round(-delta / pendingEditable.length);
      let remainder = -delta - (adjustmentPerQuota * pendingEditable.length);

      for (let i = 0; i < pendingEditable.length; i++) {
        const item = pendingEditable[i];
        let extra = i === pendingEditable.length - 1 ? remainder : 0;
        item.value = Math.max(0, item.value + adjustmentPerQuota + extra);
      }
    } else {
      warnings.push('No hay suficientes cuotas pendientes no modificadas para distribuir la diferencia.');
    }
  } else if (Math.abs(delta) > 0.01 && strategy === 'AJUSTAR_ULTIMAS') {
    let remainingDelta = -delta;
    for (let i = updatedNormalQuotas.length - 1; i >= 0; i--) {
      const q = updatedNormalQuotas[i];
      if (q.isPaidOrPartial || modifiedNumbers.has(q.number)) continue;

      if (remainingDelta < 0) {
        const canReduce = q.value;
        const reduction = Math.min(canReduce, Math.abs(remainingDelta));
        q.value -= reduction;
        remainingDelta += reduction;
      } else if (remainingDelta > 0) {
        q.value += remainingDelta;
        remainingDelta = 0;
      }
      if (Math.abs(remainingDelta) < 0.01) break;
    }
  }

  // Recalculate final sum and balance
  currentNormalSum = updatedNormalQuotas.reduce((acc, q) => acc + q.value, 0);
  grandTotalAllocated = initialTotalPactado + currentNormalSum;
  const finalDifference = grandTotalAllocated - totalValue;

  return {
    contractId,
    totalValue,
    initialTotalPactado,
    normalTotalPactado,
    grandTotalAllocated,
    difference: finalDifference,
    isBalanced: Math.abs(finalDifference) < 1,
    totalPaidSoFar,
    warnings,
    simulatedQuotas: [
      ...initialQuotas.map(q => ({
        _id: q._id ? q._id.toString() : null,
        number: q.number,
        type: q.type,
        dueDate: q.dueDate,
        value: q.value,
        status: q.status,
        amountPaid: q.amountPaid || 0,
        isPaidOrPartial: true
      })),
      ...updatedNormalQuotas
    ]
  };
}

/**
 * Applies the user-approved schedule adjustment to the database in a Mongoose session transaction.
 */
export async function applyScheduleAdjustment({ contractId, tenantId, companyId, updatedQuotas, auditUser }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const contract = await Contract.findOne({ _id: contractId, tenantId, companyId }).session(session);
    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    let grandTotal = 0;
    for (const qData of updatedQuotas) {
      grandTotal += Number(qData.value || 0);

      if (qData._id) {
        const existing = await Quota.findOne({ _id: qData._id, tenantId, companyId }).session(session);
        if (existing) {
          if (existing.status !== 'pagado') {
            existing.value = qData.value;
            if (qData.dueDate) existing.dueDate = new Date(qData.dueDate);
            await existing.save({ session });
          }
        }
      } else {
        await Quota.create([{
          tenantId,
          companyId,
          contract: contractId,
          number: qData.number,
          type: qData.type || 'normal',
          value: qData.value,
          dueDate: new Date(qData.dueDate),
          status: 'pendiente'
        }], { session });
      }
    }

    const normalCount = updatedQuotas.filter(q => q.type === 'normal').length;
    contract.installmentsCount = normalCount;
    await contract.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { success: true, message: 'Plan de pagos reestructurado exitosamente', updatedQuotasCount: updatedQuotas.length };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}
