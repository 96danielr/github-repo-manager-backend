import { jest } from '@jest/globals';
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
import Quota from '../src/models/Quota.js';

describe('Integration Test - Payments API', () => {
  let adminToken = '';
  let companyId = '';
  let testLotId = '';
  let testClientId = '';
  let testQuotaId = '';
  let testContractId = '';
  
  const testEmail = `admin.payments.test.${Date.now()}@example.com`;
  const testPassword = 'Password123';

  jest.setTimeout(30000);

  // SETUP: Create a test user, tenant and company to get an auth token
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Test Payments',
        fullName: 'Admin Test Payments',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        tenantName: 'Tenant Payments Test',
        companyName: 'Company Payments Test'
      });
      
    if (res.body.success) {
      adminToken = res.body.data.accessToken;
      companyId = res.body.data.company._id;
    } else {
      console.error('Registration failed:', res.body);
    }
  });

  // TEARDOWN: Clean up all created test data
  afterAll(async () => {
    if (adminToken) {
      const account = await UserAccount.findOne({ email: testEmail });
      if (account) {
        const memberships = await User.find({ accountId: account._id });
        const tenantIds = memberships.map(m => m.tenantId);
        
        // Delete all related data in proper order
        await Quota.deleteMany({ companyId });
        await Contract.deleteMany({ companyId });
        await Lot.deleteMany({ companyId });
        await Client.deleteMany({ companyId });
        await Company.deleteMany({ _id: companyId });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
        await User.deleteMany({ accountId: account._id });
        await UserAccount.deleteOne({ _id: account._id });
      }
    }
    // await mongoose.connection.close();
  });

  it('should get authentication token', () => {
    expect(adminToken).toBeDefined();
    expect(companyId).toBeDefined();
  });

  it('should setup preparatory data (Lot, Client, Sale)', async () => {
    // 1. Create Lot
    const lotRes = await request(app)
      .post('/api/lots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        stage: 'Proyecto Pago Test',
        nomenclature: 'MZ 1 LOTE 1',
        lotNumber: '1',
        area: 100,
        price: 40000000
      });
    testLotId = lotRes.body.data._id;

    // 2. Create Client
    const clientRes = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        name: 'Cliente Pagos',
        idNumber: `CC${Date.now()}`,
        phone: '3001234567',
        email: 'cliente@test.com'
      });
    testClientId = clientRes.body.data._id;

    // 3. Sell Lot (Generates Quotas)
    const sellRes = await request(app)
      .post(`/api/lots/${testLotId}/sell`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        clientId: testClientId,
        totalValue: 40000000,
        installmentsCount: 10,
        initialQuotaPercentage: 10 // 4M initial
      });
    
    expect(sellRes.statusCode).toBe(200);
    testContractId = sellRes.body.data.contract._id;

    // 4. Find one quota to work with
    const quota = await Quota.findOne({ contract: testContractId });
    expect(quota).not.toBeNull();
    testQuotaId = quota._id.toString();
  });

  it('should register a manual payment (REGISTER MANUAL)', async () => {
    const res = await request(app)
      .post('/api/payments/manual')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        quotaId: testQuotaId,
        amount: 4000000,
        bank: 'Bancolombia',
        observations: 'Pago inicial en efectivo registrado por admin',
        paymentDate: new Date()
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/exitosamente/i);

    // Verify in DB
    const updatedQuota = await Quota.findById(testQuotaId);
    expect(updatedQuota.status).toBe('pagado');
    expect(updatedQuota.amountPaid).toBe(4000000);
    expect(updatedQuota.paymentBank).toBe('Bancolombia');
  });

  it('should revert a payment to pending (REJECT/REVERT)', async () => {
    const res = await request(app)
      .put(`/api/payments/${testQuotaId}/reject?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/pendiente/i);

    // Verify in DB
    const updatedQuota = await Quota.findById(testQuotaId);
    expect(updatedQuota.status).toBe('pendiente');
  });

  it('should approve a payment (APPROVE)', async () => {
    // Note: Usually approve is for user-uploaded captures, 
    // but the controller just sets status to 'pagado'
    const res = await request(app)
      .put(`/api/payments/${testQuotaId}/approve?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/pagada/i);

    // Verify in DB
    const updatedQuota = await Quota.findById(testQuotaId);
    expect(updatedQuota.status).toBe('pagado');
    expect(updatedQuota.receiptUrl).toBeDefined();
  });

  it('should fetch the list of payments (READ LIST)', async () => {
    const res = await request(app)
      .get(`/api/payments/all?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.payments)).toBe(true);
    
    // The list filters for quotas that are "pagado" or have payment data
    const payment = res.body.data.payments.find(p => p.id === testQuotaId);
    expect(payment).toBeDefined();
    expect(payment.status).toBe('PAGADO');
    expect(payment.amount).toBeGreaterThan(0);
  });

  it('should error when approving an already paid quota', async () => {
    const res = await request(app)
      .put(`/api/payments/${testQuotaId}/approve?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/ya fue marcada como pagada/i);
  });

  it('should error when accessing non-existent quota', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/payments/${fakeId}/approve?companyId=${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(404);
  });
});
