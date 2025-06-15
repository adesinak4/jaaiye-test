const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Jaaiye API Documentation',
      version: '1.0.0',
      description: 'API documentation for Jaaiye application',
      contact: {
        name: 'Jaaiye Support',
        email: 'support@jaaiye.com'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://api.jaaiye.com'
          : 'http://localhost:3000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key'
        }
      }
    },
    security: [
      {
        bearerAuth: [],
        apiKeyAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/models/*.js'] // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = specs;