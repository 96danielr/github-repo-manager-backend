import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Bank from './src/models/Bank.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedBanks = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 1. Read the JSON file
    const dataPath = path.join(__dirname, 'src', 'data', 'banks.json');
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Data file not found at ${dataPath}`);
    }

    const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    console.log(`ℹ️ Found ${rawData.length} banks in JSON file`);

    // 2. Prepare data (clean up MongoDB exports if necessary)
    const cleanedBanks = rawData.map((bank) => {
      const { _id, createdAt, updatedAt, __v, ...rest } = bank;
      // If timestamps are in $date format from a MongoDB export, remove them to let mongoose handle it
      return {
        ...rest,
        isActive: rest.isActive !== undefined ? rest.isActive : true,
      };
    });

    // 3. Insert using bulkWrite/upsert to avoid duplicates based on acronym (SIGLA)
    console.log('⏳ Syncing banks with database...');
    
    const operations = cleanedBanks.map((bank) => ({
      updateOne: {
        filter: { acronym: bank.acronym },
        update: { $set: bank },
        upsert: true,
      },
    }));

    const result = await Bank.bulkWrite(operations);
    
    console.log(`✅ Seed finished!`);
    console.log(`   - Inserted/Updated: ${result.upsertedCount + result.modifiedCount}`);
    console.log(`   - Unchanged: ${cleanedBanks.length - (result.upsertedCount + result.modifiedCount)}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
};

seedBanks();
