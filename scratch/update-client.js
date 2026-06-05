import 'dotenv/config';
import mongoose from 'mongoose';
import Client from '../src/models/Client.js';

const updateClient = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const cedula = '1231231';
    const newPhone = '3103665566';

    const result = await Client.findOneAndUpdate(
      { idNumber: cedula },
      { phone: newPhone },
      { new: true }
    );

    if (result) {
      console.log(`✅ Client updated successfully!`);
      console.log(`Name: ${result.name}`);
      console.log(`Cedula: ${result.idNumber}`);
      console.log(`New Phone: ${result.phone}`);
    } else {
      console.log(`❌ Client with cedula ${cedula} not found.`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating client:', error.message);
    process.exit(1);
  }
};

updateClient();
