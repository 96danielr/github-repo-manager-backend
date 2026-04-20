import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import UserAccount from '../src/models/UserAccount.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Company from '../src/models/Company.js';
import Lot from '../src/models/Lot.js';
import Quota from '../src/models/Quota.js';
import AuditLog from '../src/models/AuditLog.js';
import { generateAccessToken } from '../src/utils/jwt.js';

describe('Integration Test - Audit Logs', () => {
  let adminToken = '';
  let tenantId = '';
  let companyId = '';
  let userId = '';
  let accountId = '';
  
  const testEmail = `admin.audit.test.${Date.now()}@example.com`;
  const testPassword = 'Password123';

  // SETUP: Create a test user, tenant and company to get an auth token
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Audit Test',
        fullName: 'Admin Audit Test',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        tenantName: 'Tenant Audit Test',
        companyName: 'Company Audit Test'
      });
      
    if (res.body.success) {
      adminToken = res.body.data.accessToken;
      companyId = res.body.data.company._id;
      tenantId = res.body.data.tenant._id;
      
      const account = await UserAccount.findOne({ email: testEmail });
      accountId = account._id;
      const membership = await User.findOne({ accountId });
      userId = membership._id;
    } else {
      throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
    }
  });

  // TEARDOWN: Clean up all created test data
  afterAll(async () => {
    if (accountId) {
      await AuditLog.deleteMany({ tenantId });
      await Lot.deleteMany({ tenantId });
      await Company.deleteMany({ tenantId });
      await Tenant.deleteMany({ _id: tenantId });
      await User.deleteMany({ accountId });
      await UserAccount.deleteOne({ _id: accountId });
    }
    // await mongoose.connection.close();
  });

  it('should record an audit log when a LOT is created', async () => {
    const res = await request(app)
      .post('/api/lots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        stage: 'Audit Stage',
        lotNumber: 'A1',
        price: 15000000,
        area: 150
      });

    expect(res.statusCode).toBe(201);
    const lotId = res.body.data._id;

    // Verify Audit Log
    const log = await AuditLog.findOne({ 
      action: 'CREATE_LOT', 
      targetId: lotId.toString() 
    });

    expect(log).toBeDefined();
    expect(log.module).toBe('LOTS');
    expect(log.userEmail).toBe(testEmail);
    expect(log.details.lotNumber).toBe('A1');
  });

  it('should record an audit log when a LOT is sold', async () => {
    // 1. Create another lot
    const lotRes = await request(app)
      .post('/api/lots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        stage: 'Audit Stage',
        lotNumber: 'A2',
        price: 20000000,
        area: 200
      });
    const lotId = lotRes.body.data._id;

    // 2. Sell the lot
    const sellRes = await request(app)
      .post(`/api/lots/${lotId}/sell`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        clientData: {
          name: 'Audit Client',
          idNumber: 'AUDIT123',
          phone: '1234567890'
        },
        totalValue: 20000000,
        installmentsCount: 12,
        initialQuotaPercentage: 10
      });

    expect(sellRes.statusCode).toBe(200);

    // 3. Verify Audit Log
    const log = await AuditLog.findOne({ 
      action: 'SELL_LOT', 
      targetId: lotId.toString() 
    });

    expect(log).toBeDefined();
    expect(log.details.totalValue).toBe(20000000);
  });

  it('should record an audit log when a LOT is reserved', async () => {
    // 1. Create a lot
    const lotRes = await request(app)
      .post('/api/lots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        stage: 'Audit Stage',
        lotNumber: 'A3',
        price: 10000000,
        area: 100
      });
    const lotId = lotRes.body.data._id;

    // 2. Reserve it
    const res = await request(app)
      .post(`/api/lots/${lotId}/reserve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        type: 'apartado',
        clientData: {
          name: 'Reserver Client',
          idNumber: 'RSV001'
        },
        amount: 2000000,
        observations: 'Reserva de prueba'
      });

    expect(res.statusCode).toBe(200);

    // 3. Verify Log
    const log = await AuditLog.findOne({ 
      action: 'RESERVE_LOT_APARTADO', 
      targetId: lotId.toString() 
    });

    expect(log).toBeDefined();
    expect(log.details.type).toBe('apartado');
    expect(log.details.amount).toBe(2000000);
  });

  it('should allow superadmin to list all logs via API', async () => {
    // 1. Promote our user to superadmin role IN THE MEMBERSHIP
    await User.findByIdAndUpdate(userId, { role: 'superadmin' });
    
    // 2. Create a NEW token with the superadmin role
    // (The payload needs to match what protect expecting)
    const superadminToken = generateAccessToken({
      accountId: accountId.toString(),
      userId: userId.toString(),
      tenantId: tenantId.toString(),
      role: 'superadmin',
      companies: [{ id: companyId.toString(), role: 'superadmin' }]
    });

    // 3. Request logs API
    const res = await request(app)
      .get('/api/admin-users/logs')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    expect(res.body.data.logs.length).toBeGreaterThanOrEqual(2); // CREATE and SELL
    
    const actions = res.body.data.logs.map(l => l.action);
    expect(actions).toContain('CREATE_LOT');
    expect(actions).toContain('SELL_LOT');
  });

  it('should forbid non-superadmin from listing logs', async () => {
    // Use the original tenant_admin token
    const res = await request(app)
      .get('/api/admin-users/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(403);
  });
});
