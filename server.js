const app = require('./app');
const mongoose = require('mongoose');
const cluster = require('cluster');
const os = require('os');

// Environment variables
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';

// Declare server variable at module level
let server;

// Database connection with retry logic
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

  } catch (error) {
    console.error('Database connection failed:', error);
    // Retry connection after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      
      mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  } else {
    // If server is not defined, just close mongoose connection
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  }

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', err);
  process.exit(1);
});

// Clustering for production (optional)
if (NODE_ENV === 'production' && cluster.isMaster && process.env.ENABLE_CLUSTER === 'true') {
  const numCPUs = os.cpus().length;
  console.log(`Master ${process.pid} is running`);
  console.log(`Forking ${numCPUs} workers...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    console.log('Starting a new worker');
    cluster.fork();
  });

} else {
  // Single process mode or worker process

  const startServer = async () => {
    try {
      // Connect to database
      await connectDB();

      // Start server
      server = app.listen(PORT, () => {
        console.log(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
        console.log(`📊 Worker ${process.pid} started`);
        
        if (NODE_ENV === 'development') {
          console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
          console.log(`📖 Health Check: http://localhost:${PORT}/health`);
        }
      });

      // Handle server errors
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use`);
          process.exit(1);
        } else {
          console.error('Server error:', err);
        }
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  // Start the server
  startServer();

  // Graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}