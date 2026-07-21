import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Quota from './src/models/Quota.js';
import Contract from './src/models/Contract.js';
import Client from './src/models/Client.js';
import Company from './src/models/Company.js';

dotenv.config();

const targetCompanyId = process.argv[2] || process.env.COMPANY_ID;

async function checkQuotasStatus() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('La variable MONGODB_URI no está definida en el .env');
    }

    console.log('📡 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conexión exitosa.');

    let query = {};
    if (targetCompanyId && mongoose.Types.ObjectId.isValid(targetCompanyId)) {
      query.companyId = targetCompanyId;
      const comp = await Company.findById(targetCompanyId);
      console.log(`\n🔍 Filtrando por empresa: ${comp?.name || targetCompanyId}\n`);
    } else {
      console.log('\n🔍 Analizando todas las cuotas en el sistema...\n');
    }

    // Summary count by status
    const statusCounts = await Quota.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 }, totalPaid: { $sum: '$amountPaid' }, totalValue: { $sum: '$value' } } }
    ]);

    console.log('--- Resumen de Cuotas ---');
    console.table(statusCounts.map(s => ({
      Estado: s._id,
      Cantidad: s.count,
      'Total Pagado': s.totalPaid.toLocaleString(),
      'Valor Esperado': s.totalValue.toLocaleString()
    })));

    // Check partial payments (amountPaid > 0 process)
    const partialQuotas = await Quota.find({
      ...query,
      amountPaid: { $gt: 0 },
      $expr: { $lt: ['$amountPaid', '$value'] }
    }).limit(10).populate({
      path: 'contract',
      select: 'number client',
      populate: { path: 'client', select: 'name idNumber' }
    });

    console.log(`\n--- Caso 1: Pagos parciales (${partialQuotas.length} registros) ---`);
    if (partialQuotas.length > 0) {
      console.table(partialQuotas.map(q => ({
        ID: q._id.toString().substring(0, 10) + '...',
        Cuota: `${q.type === 'inicial' ? 'Inicial' : 'Cuota #'}${q.number}`,
        Cliente: q.contract?.client?.name || 'N/A',
        Valor: q.value,
        Abono: q.amountPaid,
        Estado: q.status,
        Resultado: q.status === 'pendiente' ? 'OK (Pendiente)' : 'Revisar'
      })));
    } else {
      console.log('Sin registros de pagos parciales.');
    }

    // Check full payments
    const fullQuotas = await Quota.find({
      ...query,
      amountPaid: { $gt: 0 },
      $expr: { $gte: ['$amountPaid', '$value'] }
    }).limit(5).populate({
      path: 'contract',
      select: 'number client',
      populate: { path: 'client', select: 'name idNumber' }
    });

    console.log(`\n--- Caso 2: Pagos completos (${fullQuotas.length} registros) ---`);
    if (fullQuotas.length > 0) {
      console.table(fullQuotas.map(q => ({
        ID: q._id.toString().substring(0, 10) + '...',
        Cuota: `${q.type === 'inicial' ? 'Inicial' : 'Cuota #'}${q.number}`,
        Cliente: q.contract?.client?.name || 'N/A',
        Valor: q.value,
        Abono: q.amountPaid,
        Estado: q.status,
        Resultado: q.status === 'pagado' ? 'OK (Pagado)' : 'Revisar'
      })));
    }

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Conexión cerrada.');
    process.exit(0);
  }
}

checkQuotasStatus();
