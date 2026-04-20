import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';

describe('Smoke Test - System Health', () => {
  it('should return 200 and system information', async () => {
    const res = await request(app).get('/health');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('should return 404 for non-existent routes', async () => {
    const res = await request(app).get('/api/non-existent-route');
    expect(res.statusCode).toBe(404);
  });

  afterAll(async () => {
    // await mongoose.connection.close();
  });
});
