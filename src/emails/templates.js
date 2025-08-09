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

function logoTag() {
  if (EMBED_LOGO) {
    return `<img src="cid:${LOGO_CID}" alt="${escapeHtml(APP_NAME)} Logo" height="32" style="display:block;height:32px;width:auto;" />`;
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
  LOGO_CID
};