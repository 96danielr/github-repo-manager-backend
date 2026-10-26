import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import UserAccount from '../src/models/UserAccount.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Company from '../src/models/Company.js';
import { whatsappService } from '../src/services/whatsapp.service.js';

describe('Integration Test - WhatsApp manual send', () => {
  let token = '';
  let companyId = '';
  const email = `admin.wa.test.${Date.now()}@example.com`;
  const password = 'Password123';

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Test WA',
        fullName: 'Admin Test WA',
        email,
        password,
        confirmPassword: password,
        tenantName: 'Tenant WA Test',
        companyName: 'Company WA Test',
      });
    token = res.body.data?.accessToken;
    companyId = res.body.data?.company?._id;
  });

  afterAll(async () => {
    const account = await UserAccount.findOne({ email });
    if (account) {
      const memberships = await User.find({ accountId: account._id });
      await Company.deleteMany({ _id: companyId });
      await Tenant.deleteMany({ _id: { $in: memberships.map((m) => m.tenantId) } });
      await User.deleteMany({ accountId: account._id });
      await UserAccount.deleteOne({ _id: account._id });
    }
  });

  it('does not send when notifications are off', async () => {
    const saved = process.env.ENABLE_NOTIFICATIONS;
    process.env.ENABLE_NOTIFICATIONS = 'false';
    const textSpy = jest.spyOn(whatsappService, 'sendTextMessage');
    const templateSpy = jest.spyOn(whatsappService, 'sendTemplateMessage');
    try {
      const res = await request(app)
        .post('/api/whatsapp/send')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId, phone: '3001234567', text: 'Hola' });

      expect(res.statusCode).toBe(503);
      expect(textSpy).not.toHaveBeenCalled();
      expect(templateSpy).not.toHaveBeenCalled();
    } finally {
      textSpy.mockRestore();
      templateSpy.mockRestore();
      process.env.ENABLE_NOTIFICATIONS = saved;
    }
  });
});
