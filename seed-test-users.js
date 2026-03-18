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

    // Drop old indexes on the 'users' collection that may conflict
    // (e.g., the old email_1 unique index from the previous User schema)
    try {
      const usersCollection = mongoose.connection.collection('users');
      const indexes = await usersCollection.indexes();
      const hasOldEmailIndex = indexes.some((idx) => idx.key && idx.key.email);
      if (hasOldEmailIndex) {
        await usersCollection.dropIndex('email_1');
        console.log('⚠️  Dropped old email_1 index from users collection');
      }
    } catch (err) {
      // Index may not exist, that's fine
      if (err.code !== 27) {
        console.log('Note: Could not drop old index (may not exist):', err.message);
      }
    }

    // Sync indexes for the new User model
    await User.syncIndexes();
    console.log('✅ User indexes synced');

    // 1. Create Tenant
    const tenant = await Tenant.create({
      name: 'Alicante Cobranza',
      plan: 'premium',
      status: 'active',
    });
    console.log(`✅ Tenant created: ${tenant.name} (${tenant._id})`);

    // 2. Create a default Company
    const company = await Company.create({
      tenantId: tenant._id,
      name: 'Alfasur',
    });
    console.log(`✅ Company created: ${company.name} (${company._id})`);

    // 3. Create tenant_admin account
    const adminAccount = await UserAccount.create({
      email: 'admin@cobra.com',
      passwordHash: 'password123',
      fullName: 'Admin Principal',
    });
    console.log(`✅ Admin account created: ${adminAccount.email}`);

    const adminMembership = await User.create({
      accountId: adminAccount._id,
      tenantId: tenant._id,
      role: 'tenant_admin',
    });
    console.log(`✅ Admin membership created with role: ${adminMembership.role}`);

    // 4. Create an agent account
    const agentAccount = await UserAccount.create({
      email: 'agente@cobra.com',
      passwordHash: 'password123',
      fullName: 'Agente de Prueba',
    });
    console.log(`✅ Agent account created: ${agentAccount.email}`);

    const agentMembership = await User.create({
      accountId: agentAccount._id,
      tenantId: tenant._id,
      role: 'agent',
    });
    console.log(`✅ Agent membership created with role: ${agentMembership.role}`);

    console.log('\n--- Test Data Summary ---');
    console.log(`Tenant: ${tenant.name}`);
    console.log(`Company: ${company.name}`);
    console.log('Tenant Admin: admin@cobra.com / password123');
    console.log('Agent: agente@cobra.com / password123');
    console.log('------------------------\n');

    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
};

seedTestData();
