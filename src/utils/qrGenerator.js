const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const JWT_SECRET = process.env.QR_TOKEN_SECRET || 'supersecretkey'; // store securely
const APP_URL = process.env.ADMIN_ORIGIN || 'https://api.jaaiye.com'; // your base API URL

/**
 * Generates a signed JWT and QR code for a ticket
 * @param {Object} ticket
 * @returns {Promise<{ qrCode: string, token: string, verifyUrl: string }>}
 */
async function generateTicketQRCode(ticket) {
    const payload = {
        ticketId: ticket._id,
        eventId: ticket.eventId,
        userId: ticket.userId,
        type: 'ticket',
    };

    // ⚠️ No short expiration since tickets can be used weeks later
    const token = jwt.sign(payload, JWT_SECRET);

    const verifyUrl = `${APP_URL}/tickets/verify?token=${token}`;
    const qrCode = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
    });

    return { qrCode, token, verifyUrl };
}

async function verifyQRToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

module.exports = { generateTicketQRCode, verifyQRToken };
