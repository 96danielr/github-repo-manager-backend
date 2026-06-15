import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import UserAccount from './src/models/UserAccount.js';
import User from './src/models/User.js';
import Tenant from './src/models/Tenant.js';
import Company from './src/models/Company.js';
import Bank from './src/models/Bank.js';
import UserCompany from './src/models/UserCompany.js';

import Client from './src/models/Client.js';
import Lot from './src/models/Lot.js';
import Contract from './src/models/Contract.js';
import Quota from './src/models/Quota.js';
import Payment from './src/models/Payment.js';
import PaymentAttempt from './src/models/PaymentAttempt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedTestData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 0. Clean database (except Banks, we'll upsert them)
    await Promise.all([
      UserAccount.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
      Company.deleteMany({}),
      UserCompany.deleteMany({}),
      Client.deleteMany({}),
      Lot.deleteMany({}),
      Contract.deleteMany({}),
      Quota.deleteMany({}),
      Payment.deleteMany({}),
      PaymentAttempt.deleteMany({}),
    ]);
    console.log('✅ Base Database cleaned');

    // Sync indexes
    await User.syncIndexes();
    await UserAccount.syncIndexes();
    
    // Crucial: drop old indexes for Bank if we changed uniqueness (e.g. 'code')
    try {
      await Bank.collection.dropIndexes();
      console.log('✅ Bank indexes dropped for sync');
    } catch (e) {
      // Ignore if collection doesn't exist
    }
    await Bank.syncIndexes();

    // 1. Create a "Platform" / "System" Tenant for the Superadmin
    const systemTenant = await Tenant.create({
      name: 'System Platform',
      plan: 'enterprise',
      status: 'active',
    });
    console.log(`✅ System Tenant created: ${systemTenant.name}`);

    // 2. Create Superadmin UserAccount
    const superadminAccount = await UserAccount.create({
      email: 'superadmin@cobra.com',
      passwordHash: '12345678', // This will be hashed by pre-save
      fullName: 'Super Administrador',
      role: 'superadmin',
    });
    console.log(`✅ Superadmin account created: ${superadminAccount.email}`);

    // Create Superadmin membership in System Tenant
    await User.create({
      accountId: superadminAccount._id,
      tenantId: systemTenant._id,
      role: 'superadmin',
    });
    console.log(`✅ Superadmin membership assigned to ${systemTenant.name}`);

    // 3. Create a Business Tenant (The user's enterprise/project)
    const alicanteTenant = await Tenant.create({
      name: 'Alicante',
      plan: 'premium',
      status: 'active',
    });
    console.log(`✅ Business Tenant created: ${alicanteTenant.name}`);

    // 4. Create a Company within that tenant
    const alfasurCompany = await Company.create({
      tenantId: alicanteTenant._id,
      name: 'Empresas de prueba',
    });
    console.log(`✅ Company created: ${alfasurCompany.name}`);

    // 5. Create accounts and memberships for all roles
    const rolesToCreate = [
      { email: 'admin@cobra.com', role: 'tenant_admin', name: 'Tenant Admin' },
      { email: 'administrador@cobra.com', role: 'administrador', name: 'Administrador' },
      { email: 'gerente@cobra.com', role: 'gerente', name: 'Gerente' },
      { email: 'jefe_cartera@cobra.com', role: 'jefe_cartera', name: 'Jefe de Cartera' },
      { email: 'auxiliar_cartera@cobra.com', role: 'auxiliar_cartera', name: 'Auxiliar de Cartera' },
      { email: 'contador@cobra.com', role: 'contador', name: 'Contador' },
      { email: 'auxiliar_contable@cobra.com', role: 'auxiliar_contable', name: 'Auxiliar Contable' },
      { email: 'ejecutivo_comercial@cobra.com', role: 'ejecutivo_comercial', name: 'Ejecutivo Comercial' },
      { email: 'vendedor@cobra.com', role: 'vendedor', name: 'Vendedor Marcos' },
      { email: 'cliente@cobra.com', role: 'cliente', name: 'Cliente Test' },
    ];

    console.log('\n--- Creating Role Accounts ---');
    for (const r of rolesToCreate) {
      const account = await UserAccount.create({
        email: r.email,
        passwordHash: '12345678',
        fullName: r.name,
      });

      const userMembership = await User.create({
        accountId: account._id,
        tenantId: alicanteTenant._id,
        role: r.role,
      });

      // Link to Company if role is supported by UserCompany
      const companyRoles = [
        'company_admin',
        'agent',
        'vendedor',
        'administrador',
        'gerente',
        'jefe_cartera',
        'auxiliar_cartera',
        'contador',
        'auxiliar_contable',
        'ejecutivo_comercial'
      ];

      if (companyRoles.includes(r.role)) {
        await UserCompany.create({
          userId: userMembership._id,
          companyId: alfasurCompany._id,
          tenantId: alicanteTenant._id,
          role: r.role,
        });
      }
      console.log(`✅ Created ${r.role}: ${r.email}`);
    }

    console.log('\n--- Credentials for Testing ---');
    console.log('Superadmin (Platform):   superadmin@cobra.com / 12345678');
    for (const r of rolesToCreate) {
      console.log(`${r.name.padEnd(24)}: ${r.email} / 12345678`);
    }
    console.log('-------------------------------\n');

    // --- BANK SEEDING ---
    console.log('⏳ Seeding global banks...');
    const dataPath = path.join(__dirname, 'src', 'data', 'banks.json');
    if (fs.existsSync(dataPath)) {
      const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const operations = rawData.map((bank) => {
        // eslint-disable-next-line no-unused-vars
        const { _id, createdAt, updatedAt, __v, ...rest } = bank;
        return {
          updateOne: {
            filter: { acronym: bank.acronym },
            update: { $set: rest },
            upsert: true,
          },
        };
      });
      await Bank.bulkWrite(operations);
      console.log(`✅ Seeded ${rawData.length} banks from JSON`);
    } else {
      console.log('⚠️ No banks.json found at src/data/, skipping bank seed.');
    }

    await mongoose.disconnect();
    console.log('Seed finished successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
};

seedTestData();
