const fs = require('fs');
const path = require('path');
const templates = require('./templates');

function ensureDirectory(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function applyReplacements(source, replacements) {
  return Object.entries(replacements).reduce((acc, [needle, replacement]) => {
    const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return acc.replace(new RegExp(escapedNeedle, 'g'), replacement);
  }, source);
}

function exportVerificationEmail(outputDir) {
  const rawHtml = templates.verificationEmail({ code: '123456' });
  const html = applyReplacements(rawHtml, {
    '123456': '{{code}}'
  });
  fs.writeFileSync(path.join(outputDir, 'verification.html'), html, 'utf8');
}

function exportPasswordResetEmail(outputDir) {
  const rawHtml = templates.passwordResetEmail({ code: 'RESET123' });
  const html = applyReplacements(rawHtml, {
    'RESET123': '{{resetCode}}'
  });
  fs.writeFileSync(path.join(outputDir, 'password-reset.html'), html, 'utf8');
}

function exportWelcomeEmail(outputDir) {
  const rawHtml = templates.welcomeEmail({ username: 'Jane' });
  const html = applyReplacements(rawHtml, {
    'Hi Jane,': 'Hi {{userName}},'
  });
  fs.writeFileSync(path.join(outputDir, 'welcome.html'), html, 'utf8');
}

function exportReportEmail(outputDir) {
  const rawHtml = templates.reportEmail({
    reportData: {
      type: 'Sales Summary',
      period: 'January 2025',
      url: 'https://app.jaaiye.com/reports/example'
    }
  });
  const html = applyReplacements(rawHtml, {
    'Sales Summary': '{{reportType}}',
    'January 2025': '{{reportPeriod}}',
    'https://app.jaaiye.com/reports/example': '{{reportUrl}}'
  });
  fs.writeFileSync(path.join(outputDir, 'report.html'), html, 'utf8');
}

function exportPaymentConfirmationEmail(outputDir) {
  const tickets = [
    {
      publicId: 'JAAIYE-1234',
      quantity: 1,
      price: 10000,
      qrCode: 'https://cdn.jaaiye.com/qr/JAAIYE-1234.png',
      ticketData: JSON.stringify({ verifyUrl: 'https://jaaiye.com/verify/JAAIYE-1234' })
    },
    {
      publicId: 'JAAIYE-5678',
      quantity: 2,
      price: 15000,
      qrCode: 'https://cdn.jaaiye.com/qr/JAAIYE-5678.png',
      ticketData: JSON.stringify({ verifyUrl: 'https://jaaiye.com/verify/JAAIYE-5678' })
    }
  ];

  const rawHtml = templates.paymentConfirmationEmail({
    tickets: tickets.map(ticket => ({
      ...ticket,
      eventId: {
        title: 'Jaaiye Live',
        startTime: '2025-06-15T18:00:00Z',
        venue: 'Jaaiye Arena',
        _id: 'event123'
      },
      userId: {
        username: 'Alex Rivers'
      },
      assignedTo: {
        name: 'Alex Rivers'
      }
    }))
  });

  const replacements = {
    '🎟️ Your Tickets for Jaaiye Live': '{{emailHeading}}',
    'Here are your 2 tickets for Jaaiye Live.': '{{previewText}}',
    'Hi Alex Rivers,': 'Hi {{recipientName}},',
    'Jaaiye Live': '{{eventTitle}}',
    'Sunday, June 15, 2025, 07:00 PM': '{{eventDateTime}}',
    'Jaaiye Arena': '{{eventVenue}}',
    '2 tickets': '{{totalTicketsLabel}}',
    '₦40,000': '{{totalAmount}}',
    'https://jaaiye.com/verify/JAAIYE-1234': '{{verifyUrl1}}',
    'https://jaaiye.com/verify/JAAIYE-5678': '{{verifyUrl2}}',
    'https://cdn.jaaiye.com/qr/JAAIYE-1234.png': '{{qrCode1}}',
    'https://cdn.jaaiye.com/qr/JAAIYE-5678.png': '{{qrCode2}}',
    'JAAIYE-1234': '{{ticketId1}}',
    'JAAIYE-5678': '{{ticketId2}}',
    'Have all QR codes ready on your device or printed for faster entry.':
      '{{qrCodeInstructions}}',
    'https://www.jaaiye.com/events/event123': '{{eventPageUrl}}'
  };

  const html = applyReplacements(rawHtml, replacements);
  fs.writeFileSync(path.join(outputDir, 'payment-confirmation.html'), html, 'utf8');
}

function main() {
  const outputDir = path.join(__dirname, 'resend');
  ensureDirectory(outputDir);

  exportVerificationEmail(outputDir);
  exportPasswordResetEmail(outputDir);
  exportWelcomeEmail(outputDir);
  exportReportEmail(outputDir);
  exportPaymentConfirmationEmail(outputDir);

  console.log(`Email templates exported to ${outputDir}`);
}

main();

