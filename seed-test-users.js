import 'dotenv/config';
import mongoose from 'mongoose';
import UserAccount from './src/models/UserAccount.js';
import User from './src/models/User.js';
import Tenant from './src/models/Tenant.js';
import Company from './src/models/Company.js';

const seedTestData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 0. Clean database
    await Promise.all([
      UserAccount.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
      Company.deleteMany({}),
    ]);
    console.log('✅ Database cleaned');

    // Sync indexes
    await User.syncIndexes();
    await UserAccount.syncIndexes();

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

    const adminMembership = await User.create({
      accountId: adminAccount._id,
      tenantId: alicanteTenant._id,
      role: 'tenant_admin',
    });
    console.log(`✅ Admin membership assigned to ${alicanteTenant.name}`);

    // 6. Create an Agent for Alicante
    const agentAccount = await UserAccount.create({
      email: 'agente@cobra.com',
      passwordHash: '12345678',
      fullName: 'Agente Javier',
    });
    console.log(`✅ Agent account created: ${agentAccount.email}`);

    await User.create({
      accountId: agentAccount._id,
      tenantId: alicanteTenant._id,
      role: 'agent',
    });
    console.log(`✅ Agent membership assigned to ${alicanteTenant.name}`);

    console.log('\n--- Credentials for Testing ---');
    console.log('Superadmin (Platform):   superadmin@cobra.com / 12345678');
    console.log('Tenant Admin (Alicante): admin@cobra.com / 12345678');
    console.log('Agent (Alicante):        agente@cobra.com / 12345678');
    console.log('-------------------------------\n');

    await mongoose.disconnect();
    console.log('Seed finished successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
};

seedTestData();
