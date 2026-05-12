import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from './src/models/Client.js';
import Lot from './src/models/Lot.js';
import Contract from './src/models/Contract.js';
import Quota from './src/models/Quota.js';

dotenv.config();

const COMPANY_ID = '69fa5971e77087e24aa161e6';

async function cleanCompanyData() {
  try {
    console.log('--- Iniciando limpieza de datos para la empresa: ' + COMPANY_ID + ' ---');
    
    // Validar que el ID sea correcto para evitar desastres
    if (!mongoose.Types.ObjectId.isValid(COMPANY_ID)) {
      throw new Error('ID de empresa no válido');
    }

    // Conectar a la base de datos
    if (!process.env.MONGODB_URI) {
      throw new Error('La variable MONGODB_URI no está definida en el .env');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conexión a MongoDB exitosa.');

    const filter = { companyId: COMPANY_ID };

    // 1. Eliminar Cuotas
    const qDeleted = await Quota.deleteMany(filter);
    console.log(`🗑️  Cuotas eliminadas: ${qDeleted.deletedCount}`);

    // 2. Eliminar Contratos
    const conDeleted = await Contract.deleteMany(filter);
    console.log(`🗑️  Contratos eliminados: ${conDeleted.deletedCount}`);

    // 3. Eliminar Lotes
    const lDeleted = await Lot.deleteMany(filter);
    console.log(`🗑️  Lotes eliminados: ${lDeleted.deletedCount}`);

    // 4. Eliminar Clientes
    const cDeleted = await Client.deleteMany(filter);
    console.log(`🗑️  Clientes eliminados: ${cDeleted.deletedCount}`);

    console.log('\n✨ Empresa limpia y lista para nueva importación.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error.message);
    process.exit(1);
  }
}

cleanCompanyData();
