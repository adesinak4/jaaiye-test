const { Resend } = require('resend');
const fs = require('fs');
const logger = require('../utils/logger');
const templates = require('../emails/templates');
const pdfService = require('./pdfService');
const path = require('path');


class EmailService {
  constructor() {
    this.client = this.createClient();
  }


  normalizeEmailUser() {
    if (!process.env.EMAIL_USER) {
      return undefined;
    }

    return process.env.EMAIL_USER.includes('@')
      ? process.env.EMAIL_USER
      : `${process.env.EMAIL_USER}@gmail.com`;
  }

  createClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      logger.error('Resend API key not configured', {
        hasResendApiKey: !!apiKey
      });
      throw new Error('Resend API key (RESEND_API_KEY) is required');
    }

    return new Resend(apiKey);
  }

  resolveSender(customSender = {}) {
    const fallbackEmail = this.normalizeEmailUser();

    const fromEmail = customSender.fromEmail
      || process.env.RESEND_FROM_EMAIL
      || fallbackEmail;

    if (!fromEmail || !fromEmail.includes('@')) {
      logger.error('Sender email not configured', {
        fromEmail,
        hasResendFromEmail: !!process.env.RESEND_FROM_EMAIL,
        hasEmailUser: !!process.env.EMAIL_USER
      });
      throw new Error('A valid sender email (RESEND_FROM_EMAIL) is required');
    }

    const fromName = customSender.fromName
      || process.env.RESEND_FROM_NAME
      || process.env.APP_NAME
      || 'Jaaiye';

    return {
      email: fromEmail,
      name: fromName
    };
  }

  buildAttachmentsIfNeeded() {
    if (process.env.APP_EMBED_LOGO === 'true') {
      const logoFile = 'IMG_8264.PNG';
      const logoPath = path.join(__dirname, '../emails', 'assets', logoFile);
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        return [{
          filename: logoFile,
          content: logoBuffer,
          contentType: 'image/png',
          cid: templates.LOGO_CID
        }];
      } catch (error) {
        logger.warn('Failed to load embedded logo for email', {
          logoPath,
          error: error.message
        });
        return [];
      }
    }
    return [];
  }

  normalizeAttachments(attachments = []) {
    return attachments
      .filter(Boolean)
      .map(attachment => {
        const filename = attachment.filename || 'attachment';
        const contentType = attachment.contentType || attachment.type;

        let content = attachment.content;
        if (!content && attachment.path) {
          content = fs.readFileSync(attachment.path);
        }

        if (!content) {
          throw new Error(`Attachment "${filename}" is missing content or path`);
        }

        let base64Content;
        if (Buffer.isBuffer(content)) {
          base64Content = content.toString('base64');
        } else if (typeof content === 'string') {
          base64Content = attachment.encoding === 'base64'
            ? content
            : Buffer.from(content).toString('base64');
        } else {
          throw new Error(`Unsupported attachment content type for "${filename}"`);
        }

        return {
          filename,
          content: base64Content,
          ...(contentType ? { type: contentType } : {}),
          ...(attachment.cid ? { cid: attachment.cid } : {})
        };
      });
  }

  async sendEmail({ to, subject, html, text, attachments = [], cc, bcc, replyTo }) {
    try {
      const sender = this.resolveSender();
      const emailUserAddress = this.normalizeEmailUser();

      const defaultAttachments = this.buildAttachmentsIfNeeded();
      const allAttachments = [...defaultAttachments, ...(Array.isArray(attachments) ? attachments : [attachments])].filter(Boolean);
      const normalizedAttachments = this.normalizeAttachments(allAttachments);

      const arrayify = value => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.filter(Boolean);
        }
        if (typeof value === 'string' && value.includes(',')) {
          return value.split(',').map(entry => entry.trim()).filter(Boolean);
        }
        return [value];
      };

      const desiredBcc = Array.from(new Set([...arrayify(bcc), ...arrayify(emailUserAddress)])).filter(Boolean);
      const desiredReplyTo = replyTo || emailUserAddress;

      const payload = {
        from: `${sender.name} <${sender.email}>`,
        to,
        subject,
        html,
        text,
        ...(cc ? { cc } : {}),
        ...(desiredBcc.length > 0 ? { bcc: desiredBcc } : {}),
        ...(desiredReplyTo ? { reply_to: desiredReplyTo } : {}),
        attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined
      };

      const info = await this.client.emails.send(payload);
      logger.info('Email sent successfully', {
        messageId: info.id,
        to,
        subject,
        from: sender.email
      });
      return info;
    } catch (error) {
      logger.error('Error sending email via Resend', {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
        body: error.response?.body,
        to,
        subject
      });

      if (error.statusCode === 401) {
        throw new Error('Invalid Resend API key. Please verify RESEND_API_KEY.');
      }

      if (error.statusCode === 422) {
        throw new Error(`Resend rejected the request: ${error.message}`);
      }

      throw error; // Re-throw for proper error handling
    }
  }

  // Unified verification email method that handles both user objects and individual parameters
  async sendVerificationEmail(userOrEmail, verificationCode = null) {
    let email, code;

    if (typeof userOrEmail === 'object' && userOrEmail.email) {
      email = userOrEmail.email;
      code = userOrEmail.verificationCode || verificationCode;
    } else {
      email = userOrEmail;
      code = verificationCode;
    }

    if (!email || !code) {
      throw new Error('Email and verification code are required');
    }

    const html = templates.verificationEmail({ code });
    const text = `Your ${process.env.APP_NAME || 'Jaaiye'} verification code is: ${code}. It expires in 10 minutes.`;

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Email',
      html,
      text
    });
  }

  async sendPasswordResetEmail(userOrEmail, resetCode = null) {
    let email, code;

    if (typeof userOrEmail === 'object' && userOrEmail.email) {
      email = userOrEmail.email;
      code = userOrEmail.resetPasswordCode || resetCode;
    } else {
      email = userOrEmail;
      code = resetCode;
    }

    if (!email || !code) {
      throw new Error('Email and reset code are required');
    }

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?code=${code}`;
    const html = templates.passwordResetEmail({ resetUrl, code });
    const text = `Reset your password using this link: ${resetUrl} or use code: ${code}`;

    return this.sendEmail({
      to: email,
      subject: 'Reset Your Password',
      html,
      text
    });
  }

  async sendAccountDeactivationEmail(userOrEmail) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;

    if (!email) {
      throw new Error('Email is required');
    }

    const reactivationUrl = `${process.env.FRONTEND_URL}/reactivate-account`;

    const html = `
      <h1>Account Deactivated</h1>
      <p>Your account has been deactivated. You can reactivate it at any time by clicking the link below:</p>
      <a href="${reactivationUrl}" style="
        display: inline-block;
        padding: 10px 20px;
        background-color: #28a745;
        color: white;
        text-decoration: none;
        border-radius: 5px;
      ">Reactivate Account</a>
      <p>If you did not deactivate your account, please contact support immediately.</p>
    `;

    const text = `
      Account Deactivated
      Your account has been deactivated. You can reactivate it at any time by visiting: ${reactivationUrl}
      If you did not deactivate your account, please contact support immediately.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Account Deactivated',
      html,
      text
    });
  }

  async sendAccountReactivatedEmail(userOrEmail) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;

    if (!email) {
      throw new Error('Email is required');
    }

    const html = `
      <h1>Account Reactivated</h1>
      <p>Your account has been successfully reactivated. You can now log in and use all features.</p>
      <p>If you did not reactivate your account, please contact support immediately.</p>
    `;

    const text = `
      Account Reactivated
      Your account has been successfully reactivated. You can now log in and use all features.
      If you did not reactivate your account, please contact support immediately.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Account Reactivated',
      html,
      text
    });
  }

  async sendWelcomeEmail(userOrEmail) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;
    const fullName = typeof userOrEmail === 'object' ? userOrEmail.fullName : undefined;

    if (!email) {
      throw new Error('Email is required');
    }

    const html = templates.welcomeEmail({ fullName });
    const text = `Welcome to ${process.env.APP_NAME || 'Jaaiye'}!`;

    return this.sendEmail({
      to: email,
      subject: `Welcome to ${process.env.APP_NAME || 'Jaaiye'}!`,
      html,
      text
    });
  }

  // New method for sending report emails
  async sendReportEmail(userOrEmail, reportData) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;

    if (!email) {
      throw new Error('Email is required');
    }

    const html = templates.reportEmail({ reportData });
    const text = `Your report is ready. Type: ${reportData?.type || 'report'}`;

    return this.sendEmail({
      to: email,
      subject: `Report Ready: ${reportData?.title || 'Your Report'}`,
      html,
      text
    });
  }

  /**
   * Send payment confirmation email with ticket(s) and PDF attachment
   * @param {string|object} userOrEmail - User object with email or email string
   * @param {object|array} ticketsOrTicket - Single ticket object or array of tickets
   * @param {object} options - Options including attachPDF (default: true)
   * @returns {Promise} Email send result
   */
  async sendPaymentConfirmationEmail(userOrEmail, ticketsOrTicket, options = {}) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;
    const { attachPDF = true } = options;

    if (!email) {
      throw new Error('Email is required');
    }

    const tickets = Array.isArray(ticketsOrTicket) ? ticketsOrTicket : [ticketsOrTicket];

    if (!tickets || tickets.length === 0) {
      throw new Error('At least one ticket is required');
    }

    const firstTicket = tickets[0];
    if (!firstTicket.eventId) {
      throw new Error('Ticket must have event information');
    }

    const ticketCount = tickets.length;
    const eventTitle = firstTicket.eventId?.title || 'Event';

    const html = templates.paymentConfirmationEmail({ tickets });

    const subject = ticketCount > 1
      ? `🎟️ Payment Confirmed! Your ${ticketCount} Tickets for ${eventTitle}`
      : `🎟️ Payment Confirmed! Your Ticket for ${eventTitle}`;

    const text = ticketCount > 1
      ? `Payment Confirmed! Your ${ticketCount} tickets for ${eventTitle} are ready. Check your email for QR codes and PDF attachment.`
      : `Payment Confirmed! Your ticket for ${eventTitle} is ready. Check your email for the QR code and PDF attachment.`;

    let pdfAttachment = null;
    if (attachPDF) {
      try {
        let pdfBuffer;
        if (ticketCount === 1) {
          pdfBuffer = await pdfService.generateTicketPDF(tickets[0]);
        } else {
          pdfBuffer = await pdfService.generateMultipleTicketsPDF(tickets);
        }

        const fileName = ticketCount === 1
          ? `Jaaiye-Ticket-${tickets[0].publicId || tickets[0]._id}.pdf`
          : `Jaaiye-Tickets-${eventTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;

        pdfAttachment = {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf'
        };

        logger.info('PDF ticket generated', {
          email,
          ticketCount,
          fileName
        });
      } catch (pdfError) {
        logger.error('Failed to generate PDF ticket', {
          error: pdfError.message,
          email,
          ticketCount
        });
      }
    }

    try {
      const emailOptions = {
        to: email,
        subject,
        html,
        text,
        bcc: process.env.RESEND_FROM_EMAIL || process.env.EMAIL_USER
      };

      if (pdfAttachment) {
        emailOptions.attachments = [pdfAttachment];
      }

      const result = await this.sendEmail(emailOptions);

      console.log(`Payment confirmation sent to ${email} for ${ticketCount} ticket(s)${pdfAttachment ? ' with PDF attachment' : ''}`);
      return result;
    } catch (error) {
      console.error(`Failed to send payment confirmation to ${email}:`, error);
      throw new Error(`Failed to send payment confirmation email: ${error.message}`);
    }
  }

  // Test email configuration
  async testConnection() {
    try {
      this.client = this.createClient();
      const sender = this.resolveSender();
      await this.client.domains.list();
      logger.info('Resend configuration is valid');
      return {
        success: true,
        message: 'Resend configuration is valid',
        email: sender.email
      };
    } catch (error) {
      logger.error('Resend configuration test failed', {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        body: error.response?.body
      });

      let message = 'Resend configuration test failed';

      if (error.statusCode === 401) {
        message = 'Invalid Resend API key';
      } else if (error.statusCode === 404) {
        message = 'Resend account not found or domain unavailable';
      }

      return {
        success: false,
        message,
        error: error.message,
        statusCode: error.statusCode
      };
    }
  }

  // Get email configuration info (without sensitive data)
  getConfigInfo() {
    return {
      hasResendApiKey: !!process.env.RESEND_API_KEY,
      hasResendFromEmail: !!process.env.RESEND_FROM_EMAIL,
      hasResendFromName: !!process.env.RESEND_FROM_NAME,
      appName: process.env.APP_NAME || 'Jaaiye'
    };
  }
}

module.exports = new EmailService();