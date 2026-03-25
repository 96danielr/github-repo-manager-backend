import mongoose from 'mongoose';

/**
 * Global variable to cache the database connection.
 * In a serverless environment (like Vercel), the Node.js process might be reused.
 * Caching the connection avoids creating a new one on every request.
 */
let cachedConnection = null;

const connectDB = async () => {
  // If we already have a connection, return it
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  // If a connection is in progress, wait for it
  if (cachedConnection && mongoose.connection.readyState === 2) {
    return cachedConnection;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    cachedConnection = conn;
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Don't exit process in serverless, let the error propagate to the handler
    throw error;
  }
};

// Monitor connection events
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  cachedConnection = null;
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
  cachedConnection = null;
});

export default connectDB;
