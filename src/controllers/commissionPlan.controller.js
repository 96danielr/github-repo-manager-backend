import CommissionPlan from '../models/CommissionPlan.js';
import AppError from '../utils/AppError.js';

const VALID_KEYS = ['INITIAL_QUOTA', 'QUOTA_NUMBER'];

const validatePlanBody = ({ name, baseType, baseValue, tiers, milestones }) => {
  if (!name || !name.trim()) return 'El nombre del plan es obligatorio';
  if (!['percentage', 'fixed'].includes(baseType)) return 'El tipo de base debe ser percentage o fixed';
  if (baseValue === undefined || parseFloat(baseValue) < 0) return 'El valor base es obligatorio y no puede ser negativo';

  const hasTiers = Array.isArray(tiers) && tiers.length > 0;
  const hasMilestones = Array.isArray(milestones) && milestones.length > 0;

  if (!hasTiers && !hasMilestones) return 'Debes configurar tramos por cuota inicial o hitos de desembolso';

  if (hasTiers) {
    if (baseType === 'percentage') {
      return 'Los tramos por cuota inicial solo se soportan con base fija. Para base porcentaje usa hitos con porción.';
    }
    for (const tier of tiers) {
      const pct = parseFloat(tier.initialQuotaPercentage);
      if (!pct || pct <= 0 || pct > 100) {
        return 'Cada tramo debe tener un porcentaje de cuota inicial entre 1 y 100';
      }
      if (!Array.isArray(tier.milestones) || tier.milestones.length === 0) {
        return `El tramo de ${pct}% debe tener al menos un hito de desembolso`;
      }
      for (const m of tier.milestones) {
        if (!VALID_KEYS.includes(m.key)) return 'Hito inválido: use INITIAL_QUOTA o QUOTA_NUMBER';
        if (m.key === 'QUOTA_NUMBER' && (!m.quotaNumber || m.quotaNumber < 1)) {
          return 'El hito QUOTA_NUMBER requiere un número de cuota mayor a 0';
        }
        if (m.amount === undefined || parseFloat(m.amount) < 0) return 'Cada hito debe tener un monto no negativo';
      }
      const sum = tier.milestones.reduce((s, m) => s + parseFloat(m.amount), 0);
      if (Math.abs(sum - parseFloat(baseValue)) > 0.01) {
        return `El tramo de ${pct}% suma $${sum.toLocaleString()} pero el valor base es $${parseFloat(baseValue).toLocaleString()}. Deben coincidir.`;
      }
    }
  }

  if (!hasTiers && hasMilestones) {
    for (const m of milestones) {
      if (!VALID_KEYS.includes(m.key)) return 'Hito inválido: use INITIAL_QUOTA o QUOTA_NUMBER';
      if (m.key === 'QUOTA_NUMBER' && (!m.quotaNumber || m.quotaNumber < 1)) {
        return 'El hito QUOTA_NUMBER requiere un número de cuota mayor a 0';
      }
      if (m.portion === undefined || parseFloat(m.portion) <= 0) return 'Cada hito debe tener una porción mayor a 0';
    }
    const totalPortion = milestones.reduce((s, m) => s + parseFloat(m.portion), 0);
    if (Math.abs(totalPortion - 1) > 0.001) {
      return 'La suma de las porciones de los hitos debe ser 1 (100%)';
    }
  }

  return null;
};

const sanitizePlan = ({ name, baseType, baseValue, tiers, milestones, isActive }) => ({
  name: name.trim(),
  baseType,
  baseValue: parseFloat(baseValue),
  tiers: Array.isArray(tiers) ? tiers.map((t) => ({
    initialQuotaPercentage: parseFloat(t.initialQuotaPercentage),
    milestones: t.milestones.map((m) => ({
      key: m.key,
      quotaNumber: m.key === 'QUOTA_NUMBER' ? parseInt(m.quotaNumber, 10) : undefined,
      amount: parseFloat(m.amount),
    })),
  })) : [],
  milestones: Array.isArray(milestones) ? milestones.map((m) => ({
    key: m.key,
    quotaNumber: m.key === 'QUOTA_NUMBER' ? parseInt(m.quotaNumber, 10) : undefined,
    portion: parseFloat(m.portion),
  })) : [],
  isActive: isActive !== undefined ? isActive : true,
});

// Get all commission plans for a company
export const getCommissionPlans = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const filter = { tenantId, companyId };

    if (req.query.activeOnly === 'true') {
      filter.isActive = true;
    }

    const plans = await CommissionPlan.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        plans,
        count: plans.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create a new commission plan
export const createCommissionPlan = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const validationError = validatePlanBody(req.body);
    if (validationError) {
      return next(new AppError(validationError, 400));
    }

    const plan = await CommissionPlan.create({
      tenantId,
      companyId,
      ...sanitizePlan(req.body),
    });

    res.status(201).json({
      success: true,
      data: { plan },
    });
  } catch (error) {
    next(error);
  }
};

// Update an existing commission plan
export const updateCommissionPlan = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id } = req.params;

    const plan = await CommissionPlan.findOne({ _id: id, tenantId, companyId });
    if (!plan) {
      return next(new AppError('Plan de comisión no encontrado', 404));
    }

    const body = { ...plan.toObject(), ...req.body };
    const validationError = validatePlanBody(body);
    if (validationError) {
      return next(new AppError(validationError, 400));
    }

    const updated = sanitizePlan(req.body);
    plan.name = updated.name;
    plan.baseType = updated.baseType;
    plan.baseValue = updated.baseValue;
    plan.tiers = updated.tiers;
    plan.milestones = updated.milestones;
    plan.isActive = updated.isActive;
    await plan.save();

    res.json({
      success: true,
      data: { plan },
    });
  } catch (error) {
    next(error);
  }
};

// Delete (deactivate) a commission plan
export const deleteCommissionPlan = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id } = req.params;

    const plan = await CommissionPlan.findOne({ _id: id, tenantId, companyId });
    if (!plan) {
      return next(new AppError('Plan de comisión no encontrado', 404));
    }

    plan.isActive = false;
    await plan.save();

    res.json({
      success: true,
      message: 'Plan de comisión desactivado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};
