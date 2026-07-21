import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from './src/models/Client.js';
import Lot from './src/models/Lot.js';
import Contract from './src/models/Contract.js';
import Quota from './src/models/Quota.js';
import PaymentAttempt from './src/models/PaymentAttempt.js';
import Transaction from './src/models/Transaction.js';
import Bonus from './src/models/Bonus.js';
import AuditLog from './src/models/AuditLog.js';
import Company from './src/models/Company.js';

dotenv.config();

// Accept COMPANY_ID from command line argument (e.g. node clean-company.js <COMPANY_ID>)
const targetCompanyId = process.argv[2] || process.env.COMPANY_ID;

async function cleanCompanyData() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('La variable MONGODB_URI no está definida en el .env');
    }

    console.log('📡 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conexión a MongoDB exitosa.');

    // If no argument was passed and default is invalid, list companies
    if (!targetCompanyId || !mongoose.Types.ObjectId.isValid(targetCompanyId)) {
      console.log('\n⚠️ No especificaste un ID de empresa válido.');
      console.log('Empresas disponibles en la base de datos:\n');
      const companies = await Company.find({}).select('_id name');
      companies.forEach((comp) => {
        console.log(`- ID: ${comp._id} | Nombre: ${comp.name}`);
      });
      console.log('\nUso: node clean-company.js <ID_DE_LA_EMPRESA>');
      process.exit(0);
    }

    const company = await Company.findById(targetCompanyId);
    const companyName = company ? company.name : 'Desconocida';

    console.log(`\n--- 🧹 Iniciando limpieza total para la empresa: "${companyName}" (${targetCompanyId}) ---`);

    const filter = { companyId: targetCompanyId };

    // 1. Eliminar Cuotas
    const qDeleted = await Quota.deleteMany(filter);
    console.log(`🗑️  Cuotas eliminadas: ${qDeleted.deletedCount}`);

    // 2. Eliminar Intentos / Registros de Pago
    const pDeleted = await PaymentAttempt.deleteMany(filter);
    console.log(`🗑️  Pagos / Comprobantes eliminados: ${pDeleted.deletedCount}`);

    // 3. Eliminar Transacciones Financieras
    const tDeleted = await Transaction.deleteMany(filter);
    console.log(`🗑️  Transacciones eliminadas: ${tDeleted.deletedCount}`);

    // 4. Eliminar Contratos
    const conDeleted = await Contract.deleteMany(filter);
    console.log(`🗑️  Contratos eliminados: ${conDeleted.deletedCount}`);

    // 5. Eliminar Lotes
    const lDeleted = await Lot.deleteMany(filter);
    console.log(`🗑️  Lotes eliminados: ${lDeleted.deletedCount}`);

    // 6. Eliminar Clientes
    const cDeleted = await Client.deleteMany(filter);
    console.log(`🗑️  Clientes eliminados: ${cDeleted.deletedCount}`);

    // 7. Eliminar Bonos
    const bDeleted = await Bonus.deleteMany(filter);
    console.log(`🗑️  Bonos eliminados: ${bDeleted.deletedCount}`);

    // 8. Eliminar Logs de Auditoría
    const aDeleted = await AuditLog.deleteMany(filter);
    console.log(`🗑️  Registros de auditoría eliminados: ${aDeleted.deletedCount}`);

    console.log('\n✨ ¡Empresa completamente limpia! Los usuarios, configuración y cuentas de usuario se conservaron intactos.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error.message);
    process.exit(1);
  }
}

cleanCompanyData();
