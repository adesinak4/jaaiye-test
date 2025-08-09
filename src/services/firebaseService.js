const admin = require('firebase-admin');
const logger = require('../utils/logger');

class FirebaseService {
  constructor() {
    this.initialized = false;
  }

  initializeFirebase() {
    if (this.initialized || admin.apps.length > 0) {
      return;
    }

    try {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      this.initialized = true;
      logger.info('Firebase initialized successfully');
    } catch (error) {
      logger.error('Firebase initialization failed:', error);
      throw error;
    }
  }

  async sendMulticastMessage(tokens, notification, data = {}) {
    try {
      this.initializeFirebase();

      if (!tokens || tokens.length === 0) {
        return { successCount: 0, failureCount: 0, responses: [] };
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data,
        tokens,
      };

      const response = await admin.messaging().sendMulticast(message);

      logger.info(`Firebase message sent: ${response.successCount} success, ${response.failureCount} failed`);

      return response;
    } catch (error) {
      logger.error('Firebase sendMulticastMessage error:', error);
      throw error;
    }
  }

  async sendSingleMessage(token, notification, data = {}) {
    try {
      this.initializeFirebase();

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data,
        token,
      };

      const response = await admin.messaging().send(message);
      logger.info('Firebase single message sent successfully');

      return response;
    } catch (error) {
      logger.error('Firebase sendSingleMessage error:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();