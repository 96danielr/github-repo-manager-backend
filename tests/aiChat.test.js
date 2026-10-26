import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import UserAccount from '../src/models/UserAccount.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Company from '../src/models/Company.js';
import { aiChatService } from '../src/services/aiChat/aiChat.service.js';

// We will use spyOn inside the tests instead of a hoisted mock
// because this is an ESM project and jest.mock can be problematic.

describe('Integration Test - AI Chat API', () => {
  let adminToken = '';
  let companyId = '';
  
  const testEmail = `admin.ai.test.${Date.now()}@example.com`;
  const testPassword = 'Password123';

  // SETUP: Create a test user, tenant and company to get an auth token
  beforeAll(async () => {
    // The service is mocked below; it only needs to look configured.
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Test AI',
        fullName: 'Admin Test AI',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        tenantName: 'Tenant AI Test',
        companyName: 'Company AI Test'
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
  });

  it('should error when question is missing', async () => {
    const res = await request(app)
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        history: []
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Pregunta faltante/i);
  });

  it('should answer 503 without calling the model when GEMINI_API_KEY is not set', async () => {
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const spy = jest.spyOn(aiChatService, 'askStream');
    try {
      const res = await request(app)
        .post('/api/ai/ask')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ companyId, question: '¿Cuales son mis ventas?', history: [] });

      expect(res.statusCode).toBe(503);
      expect(res.body.message).toMatch(/no está configurado/i);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  it('should stream AI response when asking a valid question', async () => {
    // Setup the mock to simulate a stream
    const spy = jest.spyOn(aiChatService, 'askStream').mockImplementation(
      async (q, h, tid, cid, onToken, onMetadata) => {
        onMetadata({ type: 'text' });
        onToken('Hola');
        onToken(', esto es una');
        onToken(' respuesta de prueba.');
        return Promise.resolve();
      }
    );

    const res = await request(app)
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        question: '¿Cuales son mis ventas?',
        history: []
      });

    expect(res.statusCode).toBe(200);
    expect(res.header['content-type']).toBe('text/event-stream');
    
    // Check stream content
    expect(res.text).toContain('data: {"metadata":{"type":"text"}}');
    expect(res.text).toContain('data: {"token":"Hola"}');
    expect(res.text).toContain('data: [DONE]');
  });

  it('should handle errors during streaming', async () => {
    // Setup mock to throw an error
    const spy = jest.spyOn(aiChatService, 'askStream').mockRejectedValue(new Error('AI exhaustion error'));

    const res = await request(app)
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        question: 'Pregunta que fallará',
        history: []
      });

    // Even if it fails, the response starts as 200 (SSE headers sent before the try block calls the service)
    // and the error is sent in the stream according to the controller implementation.
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('data: {"error":"AI exhaustion error"}');
  });
});
