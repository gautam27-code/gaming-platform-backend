const mongoose = require('mongoose');

// Fail fast on queries if not connected, instead of buffering 10s and then crashing
mongoose.set('bufferCommands', false);

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/gaming';

async function connectOnce(uri) {
  const conn = await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // fail fast if server not reachable
    socketTimeoutMS: 20000,
    maxPoolSize: 10,
  });
  console.log(`MongoDB Connected: ${conn.connection.host}`);

  // Events
  mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  return conn;
}

const connectDB = async () => {
  const uri = process.env.MONGO_URI || DEFAULT_URI;
  const maxAttempts = Number(process.env.MONGO_MAX_ATTEMPTS || 10);
  let attempt = 0;
  let delay = 2000; // 2s

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await connectOnce(uri);
      return; // success
    } catch (error) {
      console.error(`Mongo connect attempt ${attempt} failed: ${error.message}`);
      if (attempt >= maxAttempts) {
        console.error('Max Mongo connection attempts reached. Will keep the server running; check MONGO_URI and network.');
        return; // don't exit; allow app to run and endpoints to respond with 500 gracefully
      }
      await new Promise(res => setTimeout(res, delay));
      // exponential backoff up to 30s
      delay = Math.min(delay * 2, 30000);
    }
  }
};

module.exports = connectDB;
