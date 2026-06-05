import 'dotenv/config';
import mongoose from 'mongoose';
import AuditLog from '../src/models/AuditLog.js';
import Quota from '../src/models/Quota.js';
import Message from '../src/models/Message.js';

const checkRecords = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    console.log('\n--- 5 LATEST AUDIT LOGS ---');
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(5);
    logs.forEach(l => {
      console.log(`[${l.createdAt.toISOString()}] User: ${l.userFullName} (${l.role}) - Action: ${l.action} on ${l.module} (Target: ${l.targetId})`);
      if (l.details) console.log('   Details:', JSON.stringify(l.details));
    });

    console.log('\n--- 5 LATEST PAYMENT QUOTAS (PAGADO OR PENDING APPROVAL) ---');
    const quotas = await Quota.find({
      $or: [
        { status: 'pagado' },
        { paymentDate: { $ne: null } },
        { paymentCapture: { $ne: null } }
      ]
    }).sort({ updatedAt: -1 }).limit(5);

    quotas.forEach(q => {
      console.log(`[Quota #${q.number}] ID: ${q._id} - Status: ${q.status} - Amount Paid: ${q.amountPaid} - Bank: ${q.paymentBank} - Date: ${q.paymentDate} - Updated: ${q.updatedAt.toISOString()}`);
    });

    console.log('\n--- 5 LATEST NOTIFICATION MESSAGES ---');
    const messages = await Message.find().sort({ createdAt: -1 }).limit(5);
    messages.forEach(m => {
      console.log(`[${m.createdAt.toISOString()}] Direction: ${m.direction} - Type: ${m.type} - Status: ${m.status} - Body: ${m.body}`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    process.exit(1);
  }
};

checkRecords();
