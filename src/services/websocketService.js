const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // Map of userId to WebSocket connections

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  async handleConnection(ws, req) {
    try {
      // Authenticate connection
      const token = req.url.split('token=')[1];
      if (!token) {
        ws.close();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        ws.close();
        return;
      }

      // Store connection
      this.clients.set(user._id.toString(), ws);

      // Set up message handler
      ws.on('message', (message) => {
        this.handleMessage(ws, user, message);
      });

      // Set up close handler
      ws.on('close', () => {
        this.clients.delete(user._id.toString());
      });

      // Send welcome message
      this.sendToUser(user._id, {
        type: 'connected',
        message: 'WebSocket connection established'
      });
    } catch(error) {
      ws.close();
    }
  }

  handleMessage(ws, user, message) {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'ping':
          this.sendToUser(user._id, { type: 'pong' });
          break;
        // Add more message types as needed
      }
    } catch(error) {
      console.error('Error handling WebSocket message:', err);
    }
  }

  sendToUser(userId, data) {
    const ws = this.clients.get(userId.toString());
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcastToUsers(userIds, data) {
    userIds.forEach(userId => this.sendToUser(userId, data));
  }

  // Event-related notifications
  notifyEventCreated(event, participants) {
    const userIds = participants.map(p => p.user.toString());
    this.broadcastToUsers(userIds, {
      type: 'event_created',
      event
    });
  }

  notifyEventUpdated(event, participants) {
    const userIds = participants.map(p => p.user.toString());
    this.broadcastToUsers(userIds, {
      type: 'event_updated',
      event
    });
  }

  notifyEventDeleted(eventId, participants) {
    const userIds = participants.map(p => p.user.toString());
    this.broadcastToUsers(userIds, {
      type: 'event_deleted',
      eventId
    });
  }

  notifyParticipantStatus(event, participant, status) {
    const organizers = event.participants
      .filter(p => p.role === 'organizer')
      .map(p => p.user.toString());

    this.broadcastToUsers(organizers, {
      type: 'participant_status_updated',
      eventId: event._id,
      participantId: participant.user.toString(),
      status
    });
  }

  notifyParticipantAdded(event, participant) {
    this.sendToUser(participant.user.toString(), {
      type: 'event_invitation',
      event
    });
  }

  notifyParticipantRemoved(event, participantId) {
    this.sendToUser(participantId, {
      type: 'participant_removed',
      eventId: event._id
    });
  }
}

module.exports = WebSocketService;