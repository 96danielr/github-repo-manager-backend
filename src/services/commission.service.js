import CommissionPlan from '../models/CommissionPlan.js';
import Commission from '../models/Commission.js';
import Quota from '../models/Quota.js';
import User from '../models/User.js';
import { sendEmail, sendWhatsApp } from '../utils/notifications.js';

const roundMoney = (n) => Math.round(n);

/**
 * Creates the Commission for a contract based on the company's active plan.
 * - Plans with tiers: picks the tier matching the contract's initial quota
 *   percentage and materializes its milestones with exact amounts (Marbella case).
 * - Plans without tiers: totalAmount = baseValue (fixed) or % of the contract
 *   totalValue; split by milestone portions.
 * Returns the created Commission or null when there is no active plan / no match.
 */
export const buildCommissionForContract = async ({ contract, tenantId, companyId }) => {
  const plan = await CommissionPlan.findOne({ tenantId, companyId, isActive: true })
    .sort({ createdAt: -1 });
  if (!plan) return null;

  const ciPct = contract.initialQuotaPercentage || 0;
  let totalAmount = 0;
  let installments = [];

  if (plan.tiers && plan.tiers.length > 0) {
    const tier = plan.tiers.find((t) => t.initialQuotaPercentage === ciPct);
    if (!tier) {
      console.warn(`[COMMISSION] Plan "${plan.name}" sin tramo para CI ${ciPct}%. No se crea comisión.`);
      return null;
    }
    totalAmount = tier.milestones.reduce((sum, m) => sum + (m.amount || 0), 0);
    installments = tier.milestones.map((m) => ({
      milestoneKey: m.key,
      quotaNumber: m.quotaNumber,
      amount: m.amount || 0,
      status: 'PENDING',
    }));
  } else if (plan.milestones && plan.milestones.length > 0) {
    const base = plan.baseType === 'fixed'
      ? plan.baseValue
      : roundMoney((contract.totalValue || 0) * (plan.baseValue / 100));
    totalAmount = base;
    installments = plan.milestones.map((m) => ({
      milestoneKey: m.key,
      quotaNumber: m.quotaNumber,
      amount: roundMoney(base * (m.portion || 0)),
      status: 'PENDING',
    }));
  } else {
    console.warn(`[COMMISSION] Plan "${plan.name}" sin tramos ni hitos. No se crea comisión.`);
    return null;
  }

  return Commission.create({
    tenantId,
    companyId,
    planId: plan._id,
    contractId: contract._id,
    sellerId: contract.sellerId,
    initialQuotaPercentage: ciPct,
    totalAmount,
    installments,
  });
};

/**
 * Evaluates commission milestones for a contract after payments are approved.
 * - INITIAL_QUOTA: activates when ALL initial quotas of the contract are paid.
 * - QUOTA_NUMBER N: activates when the normal quota #N is paid.
 * Newly activated installments go PENDING → AVAILABLE and the seller is notified.
 * Returns the list of activated installments.
 */
export const evaluateCommissionMilestones = async ({ contractId, tenantId, companyId }) => {
  const commission = await Commission.findOne({ contractId, tenantId, companyId });
  if (!commission) return [];

  const quotas = await Quota.find({ contract: contractId, tenantId, companyId });

  const initialQuotasPaid = quotas
    .filter((q) => q.type === 'inicial')
    .every((q) => q.status === 'pagado');
  const paidNormalNumbers = new Set(
    quotas
      .filter((q) => q.type === 'normal' && q.status === 'pagado')
      .map((q) => q.number)
  );

  const activated = [];
  let changed = false;

  for (const installment of commission.installments) {
    if (installment.status !== 'PENDING') continue;

    let shouldActivate = false;
    if (installment.milestoneKey === 'INITIAL_QUOTA') {
      shouldActivate = initialQuotasPaid;
    } else if (installment.milestoneKey === 'QUOTA_NUMBER') {
      shouldActivate = paidNormalNumbers.has(installment.quotaNumber);
    }

    if (shouldActivate) {
      installment.status = 'AVAILABLE';
      changed = true;
      activated.push({
        milestoneKey: installment.milestoneKey,
        quotaNumber: installment.quotaNumber,
        amount: installment.amount,
      });
    }
  }

  if (changed) {
    await commission.save();
    await notifySellerCommissionAvailable(commission, activated);
  }

  return activated;
};

const notifySellerCommissionAvailable = async (commission, activated) => {
  try {
    const seller = await User.findById(commission.sellerId).populate({
      path: 'accountId',
      select: 'fullName email phone',
    });
    if (!seller?.accountId) return;

    const total = activated.reduce((s, a) => s + a.amount, 0);
    const message = `Hola ${seller.accountId.fullName}, ¡buenas noticias! Ya tienes una comisión disponible por $${total.toLocaleString('es-CO')}. Radica tu cuenta de cobro desde el sistema para gestionar su pago.`;

    if (seller.accountId.email) {
      await sendEmail(seller.accountId.email, 'Comisión disponible - Radica tu cuenta de cobro', `<p>${message}</p>`);
    }
    if (seller.accountId.phone) {
      await sendWhatsApp(seller.accountId.phone, message);
    }
  } catch (error) {
    console.error('[COMMISSION] Error notificando comisión disponible:', error);
  }
};
