import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import UserAccount from '../src/models/UserAccount.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Company from '../src/models/Company.js';
import Lot from '../src/models/Lot.js';
import Client from '../src/models/Client.js';
import Contract from '../src/models/Contract.js';

describe('Integration Test - Reports API', () => {
  let adminToken = '';
  let companyId = '';
  let sellerId = '';
  
  const testEmail = `admin.reports.test.${Date.now()}@example.com`;
  const testPassword = 'Password123';

  beforeAll(async () => {
    // 1. Register a new admin user (this creates tenant and company)
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reports Tester',
        fullName: 'Reports Tester',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        tenantName: 'Reports Test Tenant',
        companyName: 'Reports Test Project'
      });
      
    if (res.body.success) {
      adminToken = res.body.data.accessToken;
      companyId = res.body.data.company._id;
      
      // Get the user ID to use as seller
      const account = await UserAccount.findOne({ email: testEmail });
      const user = await User.findOne({ accountId: account._id });
      sellerId = user._id;
    } else {
      throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
    }
  });

  afterAll(async () => {
    if (adminToken) {
      const account = await UserAccount.findOne({ email: testEmail });
      if (account) {
        const memberships = await User.find({ accountId: account._id });
        const tenantIds = memberships.map(m => m.tenantId);
        
        await Contract.deleteMany({ companyId });
        await Lot.deleteMany({ companyId });
        await Client.deleteMany({ companyId });
        await Company.deleteMany({ _id: companyId });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
        await User.deleteMany({ accountId: account._id });
        await UserAccount.deleteOne({ _id: account._id });
      }
    }
  });

  it('should fail to get sales report without token', async () => {
    const res = await request(app).get(`/api/reports/sales?companyId=${companyId}`);
    expect(res.statusCode).toBe(401);
  });

  it('should get an empty sales report initially', async () => {
    const res = await request(app)
      .get(`/api/reports/sales?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.salesThisMonth).toBe(0);
    expect(res.body.data.separatedLots).toBe(0);
    expect(res.body.data.topAdvisor).toBeNull();
    expect(res.body.data.lotStats).toBeInstanceOf(Array);
  });

  it('should reflect correct data after sales and reservations', async () => {
    // 1. Create a client
    const clientRes = await Client.create({
      tenantId: (await Company.findById(companyId)).tenantId,
      companyId,
      name: 'Client Test',
      idNumber: '123456789'
    });

    // 2. Create and sell a lot
    const lot1 = await Lot.create({
      tenantId: clientRes.tenantId,
      companyId,
      stage: 'Etapa 1',
      lotNumber: 'L1',
      status: 'vendido',
      sellerId,
      price: 100000
    });

    await Contract.create({
      tenantId: clientRes.tenantId,
      companyId,
      client: clientRes._id,
      lot: lot1._id,
      sellerId,
      contractDate: new Date(),
      totalValue: 100000,
      status: 'ACTIVO'
    });

    // 3. Create a separated lot
    await Lot.create({
      tenantId: clientRes.tenantId,
      companyId,
      stage: 'Etapa 1',
      lotNumber: 'L2',
      status: 'separado',
      price: 100000
    });

    // 4. Create an available lot in a different stage
    await Lot.create({
      tenantId: clientRes.tenantId,
      companyId,
      stage: 'Etapa 2',
      lotNumber: 'L3',
      status: 'disponible',
      price: 150000
    });

    // Fetch report
    const res = await request(app)
      .get(`/api/reports/sales?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.salesThisMonth).toBe(1);
    expect(res.body.data.separatedLots).toBe(1);
    expect(res.body.data.topAdvisor.name).toBe('Reports Tester');
    expect(res.body.data.topAdvisor.count).toBe(1);

    // Verify lotStats
    const lotStats = res.body.data.lotStats;
    expect(lotStats.length).toBe(2);

    const etapa1 = lotStats.find(s => s.stage === 'Etapa 1');
    expect(etapa1.total).toBe(2);
    expect(etapa1.vendidos).toBe(1);
    expect(etapa1.separados).toBe(1);
    expect(etapa1.porcentajeVendido).toBe(50);

    const etapa2 = lotStats.find(s => s.stage === 'Etapa 2');
    expect(etapa2.total).toBe(1);
    expect(etapa2.disponibles).toBe(1);
    expect(etapa2.vendidos).toBe(0);
    expect(etapa2.porcentajeVendido).toBe(0);
  });

  it('should get cash flow projection', async () => {
    const res = await request(app)
      .get(`/api/reports/projection?companyId=${companyId}&months=3`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(3);
    expect(res.body.data[0]).toHaveProperty('expectedAmount');
    expect(res.body.data[0]).toHaveProperty('label');
  });
});
