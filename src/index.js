const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const WebSocketService = require('./services/websocketService');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const { validateMobileApiKey } = require('./middleware/mobileAuthMiddleware');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./utils/asyncHandler');
const logger = require('./utils/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Create HTTP server
const server = require('http').createServer(app);

// Initialize WebSocket service
const wss = new WebSocketService(server);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
// CORS configuration to support credentials from specific origins
const allowedOrigins = [
  process.env.ADMIN_ORIGIN,
  process.env.FRONTEND_ORIGIN,
  'https://jaaiye-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:3030',
  'https://jaaiye-checkout.vercel.app'
].filter(Boolean);

const corsOptions = {
  origin: function(origin, callback) {
    // Allow non-browser/SSR requests without an origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposedHeaders: ['Content-Type']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request logging middleware (comprehensive logging)
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res, next) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS is working!' });
});

app.use('/webhooks', require('./routes/webhookRoutes'));

// Swagger docs (mounted before API key enforcement)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Apply API key validation to all other routes
app.use(validateMobileApiKey);

// Routes
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/users', require('./routes/userRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/calendars', require('./routes/calendarRoutes'));
app.use('/api/v1/events', require('./routes/eventRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));
app.use('/api/v1/health', require('./routes/healthRoutes'));
app.use('/api/v1/google', require('./routes/googleRoutes'));
app.use('/api/v1/ics', require('./routes/icsRoutes'));
app.use('/api/v1/calendar-shares', require('./routes/calendarShareRoutes'));
app.use('/api/v1/groups', require('./routes/groupRoutes'));
app.use('/api/v1/tickets', require('./routes/ticketRoutes'));
app.use('/api/v1/transactions', require('./routes/transactionRoutes'));
app.use('/api/v1/payments', require('./routes/paymentRoutes'));
app.use('/api/v1/webhook', require('./routes/webhookRoutes'));

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Error handling middleware
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...', {
    name: err.name,
    message: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', {
    name: err.name,
    message: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// Connect to MongoDB using existing configuration
connectDB();

// Start background services
const { paymentPollingQueue } = require('./queues');
paymentPollingQueue.start();

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});