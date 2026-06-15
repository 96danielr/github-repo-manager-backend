import 'dotenv/config';
import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Company from '../src/models/Company.js';

jest.setTimeout(60000);

describe('Full 100% RBAC Coverage Test Suite', () => {
  let superadminToken, adminToken, vendedorToken;
  let companyId, lotId, clientId, userId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    const company = await Company.findOne({ name: 'Alfasur S.A.' });
    if (!company) {
      throw new Error('Seed data not found. Please run npm run seed first.');
    }
    companyId = company._id.toString();

    const login = async (email, password) => {
      const res = await request(app).post('/api/auth/login').send({ email, password });
      return res.body.data?.accessToken;
    };

    superadminToken = await login('superadmin@cobra.com', '12345678');
    adminToken = await login('admin@cobra.com', '12345678');
    vendedorToken = await login('vendedor@cobra.com', '12345678');

    lotId = new mongoose.Types.ObjectId().toString();
    clientId = new mongoose.Types.ObjectId().toString();
    userId = new mongoose.Types.ObjectId().toString();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  const testCases = [
    { method: 'get', path: '/api/lots', roles: { superadmin: true, admin: true, vendedor: true } },
    { method: 'post', path: '/api/lots', body: () => ({ companyId }), roles: { superadmin: true, admin: true, vendedor: false } },
    { method: 'delete', path: `/api/lots/${lotId}`, roles: { superadmin: true, admin: true, vendedor: false } },
    { method: 'get', path: '/api/clients', roles: { superadmin: true, admin: true, vendedor: true } },
    { method: 'post', path: '/api/clients', body: () => ({ companyId }), roles: { superadmin: true, admin: true, vendedor: true } },
    { method: 'get', path: '/api/payments', roles: { superadmin: true, admin: true, vendedor: true } },
    { method: 'get', path: `/api/dashboard/summary?companyId=${companyId}`, roles: { superadmin: true, admin: true, vendedor: true } },
    { method: 'get', path: '/api/admin-users/all', roles: { superadmin: true, admin: true, vendedor: false } },
    { method: 'get', path: '/api/admin-users/logs', roles: { superadmin: true, admin: false, vendedor: false } },
    { method: 'get', path: '/api/transactions', roles: { superadmin: true, admin: true, vendedor: false } },
    { method: 'get', path: '/api/categories', roles: { superadmin: true, admin: true, vendedor: false } },
    { method: 'get', path: '/api/banks', isPublic: true, roles: { superadmin: true, admin: true, vendedor: true } },
    { method: 'post', path: '/api/banks', body: () => ({ companyId }), roles: { superadmin: true, admin: true, vendedor: false } },
    { method: 'post', path: '/api/import/excel', body: () => ({ companyId }), roles: { superadmin: true, admin: true, vendedor: false } },
  ];

  testCases.forEach(({ method, path, roles, body, isPublic }) => {
    describe(`${method.toUpperCase()} ${path}`, () => {
      
      it(`should ${isPublic ? 'ALLOW' : 'BLOCK'} unauthenticated access`, async () => {
        const res = await request(app)[method](path);
        expect(res.statusCode).toBe(isPublic ? 200 : 401);
      });

      Object.entries(roles).forEach(([roleName, isAllowed]) => {
        it(`should ${isAllowed ? 'ALLOW' : 'BLOCK'} access for ${roleName}`, async () => {
          const token = roleName === 'superadmin' ? superadminToken : 
                        roleName === 'admin' ? adminToken : vendedorToken;
          
          if (!token) throw new Error(`Token for ${roleName} is missing.`);

          let req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
          if (body) req = req.send(body());

          const res = await req;
          
          if (isAllowed) {
            expect(res.statusCode).not.toBe(403);
            expect(res.statusCode).not.toBe(401);
          } else {
            expect(res.statusCode).toBe(403);
          }
        });
      });
    });
  });
});
