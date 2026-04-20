import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import UserAccount from '../src/models/UserAccount.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Company from '../src/models/Company.js';

describe('Integration Test - Companies API', () => {
  let adminToken = '';
  let tenantId = '';
  let firstCompanyId = '';
  let secondCompanyId = '';
  
  const testEmail = `admin.companies.test.${Date.now()}@example.com`;
  const testPassword = 'Password123';

  // SETUP: Create a test user, tenant and company to get an auth token
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Test Companies',
        fullName: 'Admin Test Companies',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        tenantName: 'Tenant Companies Test',
        companyName: 'Primary Company Test'
      });
      
    if (res.body.success) {
      adminToken = res.body.data.accessToken;
      firstCompanyId = res.body.data.company._id;
      // We extract tenantId from the user object in the response if available
      // or find it in DB. Based on auth controller, it returns token and user data.
      const account = await UserAccount.findOne({ email: testEmail });
      const user = await User.findOne({ accountId: account._id });
      tenantId = user.tenantId;
    } else {
      console.error('Registration failed:', res.body);
    }
  });

  // TEARDOWN: Clean up all created test data
  afterAll(async () => {
    if (adminToken) {
      const account = await UserAccount.findOne({ email: testEmail });
      if (account) {
        // Delete all related data
        await Company.deleteMany({ tenantId });
        await Tenant.deleteOne({ _id: tenantId });
        await User.deleteMany({ accountId: account._id });
        await UserAccount.deleteOne({ _id: account._id });
      }
    }
    // await mongoose.connection.close();
  });

  it('should get authentication token and tenant context', () => {
    expect(adminToken).toBeDefined();
    expect(tenantId).toBeDefined();
    expect(firstCompanyId).toBeDefined();
  });

  it('should create a second company (CREATE)', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Secondary Company Test',
        rfc: 'SEC123456789'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company.name).toBe('Secondary Company Test');
    
    secondCompanyId = res.body.data.company._id;

    // Verify in DB
    const dbCompany = await Company.findById(secondCompanyId);
    expect(dbCompany).not.toBeNull();
    expect(dbCompany.tenantId.toString()).toBe(tenantId.toString());
  });

  it('should fetch the list of companies for the tenant (READ LIST)', async () => {
    const res = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.companies)).toBe(true);
    expect(res.body.data.companies.length).toBeGreaterThanOrEqual(2);
    
    const names = res.body.data.companies.map(c => c.name);
    expect(names).toContain('Primary Company Test');
    expect(names).toContain('Secondary Company Test');
  });

  it('should fetch a single company by ID (READ ONE)', async () => {
    const res = await request(app)
      .get(`/api/companies/${secondCompanyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company._id).toBe(secondCompanyId);
    expect(res.body.data.company.name).toBe('Secondary Company Test');
  });

  it('should update a company (UPDATE)', async () => {
    const res = await request(app)
      .put(`/api/companies/${secondCompanyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Updated Company Name',
        rfc: 'UPDATED-RFC'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company.name).toBe('Updated Company Name');
    expect(res.body.data.company.rfc).toBe('UPDATED-RFC');

    // Verify in DB
    const dbCompany = await Company.findById(secondCompanyId);
    expect(dbCompany.name).toBe('Updated Company Name');
  });

  it('should fetch company info via public endpoint (PUBLIC)', async () => {
    const res = await request(app)
      .get(`/api/companies/public/${secondCompanyId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Company Name');
    // Security check: public endpoint shouldn't return RFC or other sensitive fields
    expect(res.body.data.rfc).toBeUndefined();
    expect(res.body.data.tenantId).toBeUndefined();
  });

  it('should deactivate a company (DELETE/DEACTIVATE)', async () => {
    const res = await request(app)
      .delete(`/api/companies/${secondCompanyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/deactivated/i);

    // Verify status in DB
    const dbCompany = await Company.findById(secondCompanyId);
    expect(dbCompany.status).toBe('inactive');
  });

  it('should error when creating a company without a name', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rfc: 'NONAME123'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it('should error when accessing a company from another tenant (SECURITY)', async () => {
    // Create another user in a different tenant
    const otherUserRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Other Admin',
        fullName: 'Other Admin',
        email: `other.${Date.now()}@example.com`,
        password: testPassword,
        confirmPassword: testPassword,
        tenantName: 'Other Tenant',
        companyName: 'Other Company'
      });
    
    const otherToken = otherUserRes.body.data.accessToken;

    // Try to access the first tenant's company with the second tenant's token
    const res = await request(app)
      .get(`/api/companies/${firstCompanyId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.statusCode).toBe(404); // Or 403, but controller usually uses 404 for "not found in your scope"
  });
});
