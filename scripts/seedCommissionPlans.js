/**
 * Seed: plan de comisión de ejemplo Marbella para todas las empresas activas.
 * Comisión fija $5.000.000 por venta de lote, desembolsos según % de cuota inicial:
 *   - CI 10% → $2.500.000 al pagar la cuota inicial + $2.500.000 al pagar la cuota #6
 *   - CI 20% → $4.000.000 al pagar la cuota inicial + $1.000.000 al pagar la cuota #6
 *   - CI 30% → $5.000.000 completos al pagar la cuota inicial
 *
 * Uso: node scripts/seedCommissionPlans.js
 * Idempotente: si el plan ya existe por (companyId, name), se actualiza.
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import Company from '../src/models/Company.js';
import CommissionPlan from '../src/models/CommissionPlan.js';

const PLAN_NAME = 'Comisión venta de lote (Marbella)';

const TIERS = [
  {
    initialQuotaPercentage: 10,
    milestones: [
      { key: 'INITIAL_QUOTA', amount: 2500000 },
      { key: 'QUOTA_NUMBER', quotaNumber: 6, amount: 2500000 },
    ],
  },
  {
    initialQuotaPercentage: 20,
    milestones: [
      { key: 'INITIAL_QUOTA', amount: 4000000 },
      { key: 'QUOTA_NUMBER', quotaNumber: 6, amount: 1000000 },
    ],
  },
  {
    initialQuotaPercentage: 30,
    milestones: [
      { key: 'INITIAL_QUOTA', amount: 5000000 },
    ],
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log('Conectado.');

  const companies = await Company.find({ status: 'active' });
  console.log(`Empresas activas: ${companies.length}`);

  for (const company of companies) {
    const existing = await CommissionPlan.findOne({ companyId: company._id, name: PLAN_NAME });

    const data = {
      tenantId: company.tenantId,
      companyId: company._id,
      name: PLAN_NAME,
      baseType: 'fixed',
      baseValue: 5000000,
      tiers: TIERS,
      milestones: [],
      isActive: true,
    };

    if (existing) {
      Object.assign(existing, data);
      await existing.save();
      console.log(`✔ Actualizado plan para "${company.name}" (${company._id})`);
    } else {
      await CommissionPlan.create(data);
      console.log(`✔ Creado plan para "${company.name}" (${company._id})`);
    }
  }

  await mongoose.disconnect();
  console.log('Listo.');
};

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
