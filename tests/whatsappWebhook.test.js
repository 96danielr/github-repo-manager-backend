import crypto from 'crypto';
import request from 'supertest';
import app from '../src/app.js';

describe('Integration Test - Meta WhatsApp webhook', () => {
  const saved = {};
  beforeAll(() => {
    saved.verify = process.env.WHATSAPP_VERIFY_TOKEN;
    saved.secret = process.env.META_APP_SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-for-tests';
    process.env.META_APP_SECRET = 'app-secret-for-tests';
  });
  afterAll(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = saved.verify;
    process.env.META_APP_SECRET = saved.secret;
  });

  const sign = (raw, secret = process.env.META_APP_SECRET) =>
    'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

  it('answers the challenge as plain text when the verify token matches', async () => {
    const res = await request(app)
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token-for-tests', 'hub.challenge': '12345' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe('12345');
  });

  it('refuses a wrong verify token with 403', async () => {
    const res = await request(app)
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '12345' });
    expect(res.statusCode).toBe(403);
    expect(res.text).not.toContain('12345');
  });

  it('accepts an event signed with the app secret', async () => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(raw))
      .send(raw);
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('EVENT_RECEIVED');
  });

  it('rejects unsigned events and events signed with another secret', async () => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const unsigned = await request(app).post('/api/whatsapp/webhook').set('Content-Type', 'application/json').send(raw);
    const forged = await request(app)
      .post('/api/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(raw, 'other-secret'))
      .send(raw);
    expect(unsigned.statusCode).toBe(401);
    expect(forged.statusCode).toBe(401);
  });
});
