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

    // 3. Create a Business Tenant (The user's enterprise)
    const alicanteTenant = await Tenant.create({
      name: 'Alicante Cobranza',
      plan: 'premium',
      status: 'active',
    });
    console.log(`✅ Business Tenant created: ${alicanteTenant.name}`);

    // 4. Create a Company within that tenant
    const alfasurCompany = await Company.create({
      tenantId: alicanteTenant._id,
      name: 'Alfasur S.A.',
    });
    console.log(`✅ Company created: ${alfasurCompany.name}`);

    // 5. Create a Tenant Admin for Alicante
    const adminAccount = await UserAccount.create({
      email: 'admin@cobra.com',
      passwordHash: '12345678',
      fullName: 'Administrador Alicante',
    });
    console.log(`✅ Admin account created: ${adminAccount.email}`);

    await User.create({
      accountId: adminAccount._id,
      tenantId: alicanteTenant._id,
      role: 'tenant_admin',
    });
    console.log(`✅ Admin membership assigned to ${alicanteTenant.name}`);

    const vendedorAccount = await UserAccount.create({
      email: 'vendedor@cobra.com',
      passwordHash: '12345678',
      fullName: 'Vendedor Marcos',
    });
    console.log(`✅ Vendedor account created: ${vendedorAccount.email}`);

    const vendedorMembership = await User.create({
      accountId: vendedorAccount._id,
      tenantId: alicanteTenant._id,
      role: 'vendedor',
    });

    // CRITICAL: Link Vendedor to Company
    await UserCompany.create({
      userId: vendedorMembership._id,
      companyId: alfasurCompany._id,
      tenantId: alicanteTenant._id,
      role: 'vendedor',
    });
    console.log(`✅ Vendedor membership assigned to ${alicanteTenant.name} and linked to ${alfasurCompany.name}`);

    console.log('\n--- Credentials for Testing ---');
    console.log('Superadmin (Platform):   superadmin@cobra.com / 12345678');
    console.log('Tenant Admin (Alicante): admin@cobra.com / 12345678');
    console.log('Vendedor (Alicante):     vendedor@cobra.com / 12345678');
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
