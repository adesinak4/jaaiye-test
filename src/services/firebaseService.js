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

  async generateToken(userId) {
    try {
      this.initializeFirebase();
      const token = await admin.auth().createCustomToken(userId);
      return token;
    } catch (error) {
      logger.error('Firebase generateToken error:', error);
      throw error;
    }
  }

  async verifyToken(token) {
    try {
      this.initializeFirebase();
      const decodedToken = await admin.auth().verifyIdToken(token);
      return decodedToken;
    } catch (error) {
      logger.error('Firebase verifyToken error:', error);
      throw error;
    }
  }

  async createGroup(groupId, groupName, groupMembers) {
    try {
      this.initializeFirebase();
      await admin.firestore().collection('groups').doc(groupId).set({
        name: groupName,
        members: groupMembers,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, id: groupId };
    } catch (error) {
      logger.error('Firebase createGroup error:', error);
      throw new Error('Failed to create group in Firebase');
    }
  }

  async getGroupSnapshot(groupId) {
    try {
      this.initializeFirebase();
      const doc = await admin.firestore().collection('groups').doc(groupId.toString()).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      logger.error('Firebase getGroupSnapshot error:', error);
      return null;
    }
  };

  async updateGroup(groupId, updates) {
    try {
      this.initializeFirebase();
      await admin.firestore().collection('groups').doc(groupId.toString()).update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      logger.error('Firebase updateGroup error:', error);
      throw new Error('Failed to update group in Firebase');
    }
  };

  async deleteGroup(groupId) {
    try {
      this.initializeFirebase();
      await admin.firestore().collection('groups').doc(groupId.toString()).delete();
      logger.info(`Group deleted from Firebase: ${groupId}`);
    } catch (error) {
      logger.error('Firebase deleteGroup error:', error);
      throw new Error('Failed to delete group from Firebase');
    }
  };

  async addMember(groupId, memberId) {
    try {
      this.initializeFirebase();
      await admin.firestore().collection('groups').doc(groupId).update({
        [`members.${memberId}`]: true
      });
    } catch (error) {
      logger.error('Firebase addMember error:', error);
      throw error;
    }
  }

  async removeMember(groupId, memberId) {
    try {
      this.initializeFirebase();
      await admin.firestore().collection('groups').doc(groupId).update({
        [`members.${memberId}`]: admin.firestore.FieldValue.delete()
      });
    } catch (error) {
      logger.error('Firebase removeMember error:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();