const fs = require('fs');
const path = require('path');

const APP_NAME = process.env.APP_NAME || 'Jaaiye';
const APP_URL = process.env.APP_URL || 'https://www.jaaiye.com/';
const APP_LOGO_URL = process.env.APP_LOGO_URL || '';
const EMBED_LOGO = process.env.APP_EMBED_LOGO === 'true';
const LOGO_CID = 'app-logo';
const PRIMARY = process.env.BRAND_PRIMARY_COLOR || '#4F46E5';
const ACCENT = process.env.BRAND_ACCENT_COLOR || '#22C55E';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const BG = '#F8FAFC';
const CARD_BG = '#FFFFFF';
const CURRENCY_SYMBOL = '₦';
const DEFAULT_LOCALE = 'en-NG';
const EMAIL_ASSETS_DIR = path.join(__dirname, 'assets');
const DEFAULT_LOGO_FILE = process.env.APP_LOGO_FILE || 'IMG_8264.PNG';

let embeddedLogoDataUrl = '';
if (EMBED_LOGO) {
  try {
    const logoPath = path.join(EMAIL_ASSETS_DIR, DEFAULT_LOGO_FILE);
    const logoBuffer = fs.readFileSync(logoPath);
    const ext = DEFAULT_LOGO_FILE.split('.').pop().toLowerCase();
    const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    embeddedLogoDataUrl = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
  } catch (error) {
    console.error('Failed to load embedded logo asset:', error.message);
  }
}

// Helper function to format currency
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return `${CURRENCY_SYMBOL}${amount.toLocaleString(DEFAULT_LOCALE)}`;
}

// Helper function to format date range
function formatEventDate(startTime, endTime) {
  if (!startTime) return 'Date TBA';

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;

  const dateOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };

  const dateStr = start.toLocaleDateString(DEFAULT_LOCALE, dateOptions);
  const startTimeStr = start.toLocaleTimeString(DEFAULT_LOCALE, timeOptions);

  if (end) {
    const endTimeStr = end.toLocaleTimeString(DEFAULT_LOCALE, timeOptions);
    return `${dateStr}, ${startTimeStr} - ${endTimeStr}`;
  }

  return `${dateStr}, ${startTimeStr}`;
}

// Helper function to parse ticket data
function parseTicketData(ticket) {
  let verifyUrl = null;

  if (ticket.ticketData) {
    try {
      const parsed = JSON.parse(ticket.ticketData);
      verifyUrl = parsed.verifyUrl;
    } catch (error) {
      console.error('Failed to parse ticket data:', error);
    }
  }

  return { verifyUrl };
}

function logoTag() {
  if (embeddedLogoDataUrl) {
    return `<img src="${embeddedLogoDataUrl}" alt="${escapeHtml(APP_NAME)} Logo" height="32" style="display:block;height:32px;width:auto;" />`;
  }
  if (APP_LOGO_URL) {
    return `<img src="${APP_LOGO_URL}" alt="${escapeHtml(APP_NAME)} Logo" height="32" style="display:block;height:32px;width:auto;" />`;
  }
  return `<div style="height:32px"></div>`;
}

function baseLayout({ title, previewText = '', bodyHtml, cta = null, footerHtml = '' }) {
  const buttonHtml = cta && cta.url
    ? `<a href="${cta.url}" target="_blank" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700;text-align:center;">${cta.label}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(title || APP_NAME)}</title>
<!-- Preheader -->
<meta name="x-preheader" content="${escapeHtml(previewText)}" />
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;color:${TEXT};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BG};padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:${CARD_BG};border-radius:16px;box-shadow:0 1px 3px rgba(15,23,42,0.08);overflow:hidden;">
          <tr>
            <td style="padding:20px 20px 0 20px;background:${CARD_BG};">
              <div style="display:flex;align-items:center;gap:12px;">
                ${logoTag()}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 20px 0 20px;background:${CARD_BG};">
              <h1 style="margin:0 0 6px 0;font-size:20px;line-height:1.35;color:${TEXT}">${escapeHtml(title || '')}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 20px 0 20px;color:${MUTED};font-size:14px;">
              ${previewText ? `<div>${escapeHtml(previewText)}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px;">
              <div style="font-size:16px;line-height:1.6;color:${TEXT}">
                ${bodyHtml}
              </div>
              ${buttonHtml ? `<div style="margin-top:16px;">${buttonHtml}</div>` : ''}
            </td>
          </tr>
          ${footerHtml ? `<tr><td style="padding:14px 20px 20px 20px;color:${MUTED};font-size:12px;border-top:1px solid #E2E8F0;">${footerHtml}</td></tr>` : ''}
        </table>
        <div style="margin-top:10px;color:${MUTED};font-size:12px;">&copy; ${new Date().getFullYear()} ${escapeHtml(APP_NAME)}. All rights reserved.</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function verificationEmail({ code }) {
  const title = 'Verify Your Email';
  const previewText = 'Use the code below to verify your email.';
  const bodyHtml = `
    <p>Welcome to ${escapeHtml(APP_NAME)}! Use the code below to verify your email address.</p>
    <div style="margin:14px 0;padding:12px 16px;background:#EEF2FF;border:1px dashed ${PRIMARY};border-radius:12px;font-weight:800;font-size:24px;letter-spacing:3px;text-align:center;color:${PRIMARY};">${escapeHtml(code)}</div>
    <p style="color:${MUTED}">This code expires in 10 minutes. If you didn\'t request this, you can safely ignore this email.</p>
  `;
  return baseLayout({ title, previewText, bodyHtml });
}

function passwordResetEmail({ code }) {
  const title = 'Reset Your Password';
  const previewText = 'Use the code below to reset your password.';
  const bodyHtml = `
    <p>We received a request to reset your password.</p>
    <p>You can reset your password using this code below:</p>
    <div style="margin:14px 0;padding:12px 16px;background:#ECFDF5;border:1px dashed ${ACCENT};border-radius:12px;font-weight:800;font-size:20px;letter-spacing:2px;text-align:center;color:${ACCENT};">${escapeHtml(code)}</div>
    <p style="color:${MUTED}">If you didn\'t request this, you can safely ignore this email.</p>
  `;
  return baseLayout({ title, previewText, bodyHtml });
}

function welcomeEmail({ username }) {
  const title = `Welcome to ${APP_NAME}!`;
  const previewText = 'Let\'s make plans that actually happen.';
  const bodyHtml = `
    <p>${username ? `Hi ${escapeHtml(username)},` : 'Hi,'}</p>
    <p>Thanks for joining ${escapeHtml(APP_NAME)} — the easiest way to plan hangouts with friends that actually happen.</p>
    <ul style="padding-left:18px;margin:12px 0 0 0;">
      <li>Sync your calendar for auto scheduling</li>
      <li>Create a hangout and invite friends</li>
      <li>Pick a time that works for everyone</li>
    </ul>
    <p style="margin-top:12px;color:${MUTED}">You\'re ready to go!</p>
  `;
  return baseLayout({ title, previewText, bodyHtml, cta: { label: 'Open App', url: APP_URL } });
}

// Generate QR code section for a single ticket
function generateTicketQRSection(ticket, index, totalTickets) {
  const readableId = ticket.publicId || ticket._id?.toString();
  const ticketId = escapeHtml(readableId || 'N/A');
  const { verifyUrl } = parseTicketData(ticket);
  const ticketNumber = totalTickets > 1 ? ` #${index + 1}` : '';

  return `
    <div style="margin: 24px 0; padding: 24px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px;">
      ${totalTickets > 1 ? `
      <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #0F172A;">
        Ticket${ticketNumber}
      </h3>
      ` : `
      <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #0F172A;">
        Your Entry Pass
      </h3>
      `}

      <div style="text-align: center; margin-bottom: 16px;">
        <img
          src="${ticket.qrCode}"
          alt="Entry QR code for ticket ${ticketId}"
          style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid #E2E8F0; display: block; margin: 0 auto;"
        />
      </div>

      <div style="text-align: center;">
        <p style="font-size: 12px; color: #64748B; margin: 0; font-family: 'Courier New', monospace;">
          Ticket ID: ${ticketId}
        </p>
      </div>
    </div>
  `;
}

// Main email generation function
function paymentConfirmationEmail({ tickets }) {
  // Normalize input - accept single ticket or array of tickets
  const ticketArray = Array.isArray(tickets) ? tickets : [tickets];

  if (!ticketArray || ticketArray.length === 0) {
    throw new Error('Ticket data is required');
  }

  // Use first ticket for common information (event, user, price)
  const firstTicket = ticketArray[0];
  const event = firstTicket.eventId || {};
  const user = firstTicket.userId || {};
  const assigned = firstTicket.assignedTo || {};

  const recipientName = escapeHtml(
    assigned.name || user.username || 'Valued Guest'
  );
  const eventTitle = escapeHtml(event.title || 'Upcoming Event');
  const totalTickets = ticketArray.length;
  const totalQuantity = ticketArray.reduce((sum, t) => sum + (t.quantity || 1), 0);
  const totalPrice = ticketArray.reduce((sum, t) => sum + ((t.price || 0) * (t.quantity || 1)), 0);

  const title = `🎟️ Your ${totalTickets > 1 ? 'Tickets' : 'Ticket'} for ${eventTitle}`;
  const previewText = `Here ${totalTickets > 1 ? 'are' : 'is'} your ${totalTickets} ticket${totalTickets > 1 ? 's' : ''} for ${eventTitle}.`;

  const bodyHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <p style="font-size: 16px; color: #1E293B; margin-bottom: 16px;">
        Hi ${recipientName},
      </p>

      <p style="font-size: 16px; color: #1E293B; margin-bottom: 24px;">
        You're all set! Here ${totalTickets > 1 ? 'are' : 'is'} your ${totalTickets > 1 ? `<strong>${totalTickets} tickets</strong>` : 'ticket'} for
        <strong>${eventTitle}</strong>.
      </p>

      <!-- Event Details Card -->
      <div style="margin: 24px 0; padding: 20px; border: 1px solid #E2E8F0; border-radius: 12px; background: #F8FAFC;">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0F172A;">
          Event Details
        </h2>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748B; font-size: 14px; width: 120px; vertical-align: top;">
              Event:
            </td>
            <td style="padding: 8px 0; color: #1E293B; font-size: 14px; font-weight: 500;">
              ${eventTitle}
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0; color: #64748B; font-size: 14px; vertical-align: top;">
              Date & Time:
            </td>
            <td style="padding: 8px 0; color: #1E293B; font-size: 14px;">
              ${formatEventDate(event.startTime)}
            </td>
          </tr>

          ${event.venue ? `
          <tr>
            <td style="padding: 8px 0; color: #64748B; font-size: 14px; vertical-align: top;">
              Venue:
            </td>
            <td style="padding: 8px 0; color: #1E293B; font-size: 14px;">
              ${escapeHtml(event.venue)}
            </td>
          </tr>
          ` : ''}

          ${totalTickets > 1 ? `
          <tr>
            <td style="padding: 8px 0; color: #64748B; font-size: 14px; vertical-align: top;">
              Total Tickets:
            </td>
            <td style="padding: 8px 0; color: #1E293B; font-size: 14px;">
              ${totalTickets} ticket${totalTickets > 1 ? 's' : ''}
            </td>
          </tr>
          ` : ''}

          ${totalPrice > 0 ? `
          <tr>
            <td style="padding: 8px 0; color: #64748B; font-size: 14px; vertical-align: top;">
              Total Paid:
            </td>
            <td style="padding: 8px 0; color: #1E293B; font-size: 14px; font-weight: 600;">
              ${formatCurrency(totalPrice)}
            </td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- QR Code Section(s) -->
      ${totalTickets > 1 ? `
      <h2 style="margin: 32px 0 16px 0; font-size: 18px; color: #0F172A;">
        Your Tickets
      </h2>
      <p style="font-size: 14px; color: #64748B; margin-bottom: 16px;">
        Each ticket has a unique QR code. Please present the correct ticket at the event entrance.
      </p>
      ` : ''}

      ${ticketArray.map((ticket, index) =>
        ticket.qrCode ? generateTicketQRSection(ticket, index, totalTickets) : ''
      ).join('')}

      ${ticketArray.some(t => t.qrCode) ? `
      <p style="font-size: 13px; color: #64748B; text-align: center; margin: 16px 0; line-height: 1.5;">
        ${totalTickets > 1
          ? 'Show these QR codes at the event entrance for seamless check-in.'
          : 'Show this QR code at the event entrance for seamless check-in.'}
      </p>
      ` : ''}

      <!-- Important Information -->
      <div style="margin: 24px 0; padding: 16px; background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #92400E; line-height: 1.6;">
          <strong>Important:</strong> Please arrive 15-30 minutes before the event starts.
          ${totalTickets > 1
            ? 'Have all QR codes ready on your device or printed for faster entry.'
            : 'Have this QR code ready on your device or printed for faster entry.'}
        </p>
      </div>

      <p style="font-size: 16px; color: #1E293B; margin-top: 32px;">
        We can't wait to see you there!
      </p>

      <p style="font-size: 14px; color: #64748B; margin-top: 24px;">
        Questions? Reply to this email or contact our support team.
      </p>
    </div>
  `;

  return baseLayout({
    title,
    previewText,
    bodyHtml,
    cta: event._id ? {
      label: 'View Event Details',
      url: `${APP_URL}events/${event._id}`
    } : null
  });
}


function reportEmail({ reportData }) {
  const title = 'Your Report';
  const previewText = 'Your requested report is ready.';
  const bodyHtml = `
    <p>Your requested report is ready.</p>
    <p><strong>Type:</strong> ${escapeHtml(String(reportData?.type || 'report'))}</p>
    ${reportData?.period ? `<p><strong>Period:</strong> ${escapeHtml(String(reportData.period))}</p>` : ''}
  `;
  return baseLayout({ title, previewText, bodyHtml, cta: reportData?.url ? { label: 'View Report', url: reportData.url } : null });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  baseLayout,
  verificationEmail,
  passwordResetEmail,
  welcomeEmail,
  reportEmail,
  LOGO_CID,
  paymentConfirmationEmail
};