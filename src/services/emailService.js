const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const templates = require('../emails/templates');
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    // Validate credentials exist
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.error('Email credentials not configured', {
        hasUser: !!process.env.EMAIL_USER,
        hasPass: !!process.env.EMAIL_PASS
      });
      throw new Error('Email credentials (EMAIL_USER and EMAIL_PASS) are required');
    }

    // Ensure email is in correct format (full email address, not just username)
    const emailUser = process.env.EMAIL_USER.includes('@')
      ? process.env.EMAIL_USER
      : `${process.env.EMAIL_USER}@gmail.com`;

    // Try different configurations based on environment
    const configs = [
      // Gmail with port 465 (SSL) - Most reliable for app passwords
      {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // SSL
        auth: {
          user: emailUser,
          pass: process.env.EMAIL_PASS
        },
        debug: process.env.NODE_ENV === 'development',
        logger: process.env.NODE_ENV === 'development'
      },
      // Gmail with port 587 (TLS) - Alternative
      {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use TLS
        auth: {
          user: emailUser,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        },
        debug: process.env.NODE_ENV === 'development',
        logger: process.env.NODE_ENV === 'development'
      },
      // Gmail service (nodemailer auto-config)
      {
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: process.env.EMAIL_PASS
        },
        debug: process.env.NODE_ENV === 'development',
        logger: process.env.NODE_ENV === 'development'
      },
      // Custom SMTP if configured
      process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || emailUser,
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
        },
        debug: process.env.NODE_ENV === 'development',
        logger: process.env.NODE_ENV === 'development'
      } : null
    ].filter(Boolean);

    // Try each configuration and verify connection
    for (const config of configs) {
      try {
        const transporter = nodemailer.createTransport(config);

        // Verify connection before returning
        // Note: We'll verify asynchronously, but create the transporter first
        logger.info('Email transporter created', {
          service: config.service || config.host,
          port: config.port,
          user: config.auth.user
        });

        return transporter;
      } catch (error) {
        logger.warn('Failed to create email transporter with config', {
          config: config.service || config.host,
          error: error.message
        });
      }
    }

    // If all configs failed, throw error instead of using fallback
    throw new Error('Failed to create email transporter. Please check your EMAIL_USER and EMAIL_PASS environment variables.');
  }

  buildAttachmentsIfNeeded() {
    if (process.env.APP_EMBED_LOGO === 'true') {
      const logoPath = path.join(__dirname, '../..', 'assets', 'logo.png');
      return [{
        filename: 'logo.png',
        path: logoPath,
        cid: templates.LOGO_CID
      }];
    }
    return [];
  }

  async sendEmail({ to, subject, html, text }) {
    try {
      // Ensure EMAIL_USER is in correct format
      const fromEmail = process.env.EMAIL_USER.includes('@')
        ? process.env.EMAIL_USER
        : `${process.env.EMAIL_USER}@gmail.com`;

      const mailOptions = {
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${fromEmail}>`,
        to,
        subject,
        html,
        text,
        attachments: this.buildAttachmentsIfNeeded()
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to,
        subject,
        from: fromEmail
      });
      return info;
    } catch (error) {
      logger.error('Error sending email', {
        error: error.message,
        stack: error.stack,
        to,
        subject,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });

      // Provide more specific error messages with troubleshooting tips
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        const troubleshootingTips = [
          '1. Verify your EMAIL_USER is the full email address (e.g., yourname@gmail.com)',
          '2. Ensure you\'re using an App Password (not your regular Gmail password)',
          '3. Make sure 2-Step Verification is enabled on your Google account',
          '4. Generate a new App Password: https://myaccount.google.com/apppasswords',
          '5. Copy the 16-character app password exactly (no spaces)',
          '6. If using a workspace account, ensure "Less secure app access" is enabled (if available)'
        ].join('\n');

        throw new Error(`Email authentication failed (${error.responseCode || error.code}).\n\nTroubleshooting:\n${troubleshootingTips}\n\nOriginal error: ${error.message}`);
      } else if (error.code === 'ECONNECTION') {
        throw new Error('Email connection failed. Please check your internet connection and firewall settings.');
      } else if (error.code === 'EADDRNOTAVAIL') {
        throw new Error('Email server unavailable. Please check your email configuration and try again later.');
      }

      throw error; // Re-throw for proper error handling
    }
  }

  // Unified verification email method that handles both user objects and individual parameters
  async sendVerificationEmail(userOrEmail, verificationCode = null) {
    let email, code;

    // Handle both user object and individual parameters
    if (typeof userOrEmail === 'object' && userOrEmail.email) {
      // Called with user object: sendVerificationEmail(user)
      email = userOrEmail.email;
      code = userOrEmail.verificationCode || verificationCode;
    } else {
      // Called with individual parameters: sendVerificationEmail(email, code)
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

    // Handle both user object and individual parameters
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
   * Send payment confirmation email with ticket(s)
   * @param {string|object} userOrEmail - User object with email or email string
   * @param {object|array} ticketsOrTicket - Single ticket object or array of tickets
   * @returns {Promise} Email send result
   */
  async sendPaymentConfirmationEmail(userOrEmail, ticketsOrTicket) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;

    if (!email) {
      throw new Error('Email is required');
    }

    // Normalize tickets to always be an array
    const tickets = Array.isArray(ticketsOrTicket) ? ticketsOrTicket : [ticketsOrTicket];

    if (!tickets || tickets.length === 0) {
      throw new Error('At least one ticket is required');
    }

    // Validate that tickets have required data
    const firstTicket = tickets[0];
    if (!firstTicket.eventId) {
      throw new Error('Ticket must have event information');
    }

    const ticketCount = tickets.length;
    const eventTitle = firstTicket.eventId?.title || 'Event';

    // Generate email HTML
    const html = templates.paymentConfirmationEmail({ tickets });

    // Dynamic subject based on ticket count
    const subject = ticketCount > 1
      ? `🎟️ Payment Confirmed! Your ${ticketCount} Tickets for ${eventTitle}`
      : `🎟️ Payment Confirmed! Your Ticket for ${eventTitle}`;

    // Plain text fallback
    const text = ticketCount > 1
      ? `Payment Confirmed! Your ${ticketCount} tickets for ${eventTitle} are ready. Check your email for QR codes.`
      : `Payment Confirmed! Your ticket for ${eventTitle} is ready. Check your email for the QR code.`;

    try {
      const result = await this.sendEmail({
        to: email,
        subject,
        html,
        text
      });

      console.log(`Payment confirmation sent to ${email} for ${ticketCount} ticket(s)`);
      return result;
    } catch (error) {
      console.error(`Failed to send payment confirmation to ${email}:`, error);
      throw new Error(`Failed to send payment confirmation email: ${error.message}`);
    }
  }

  // Test email configuration
  async testConnection() {
    try {
      // Recreate transporter to ensure we're testing with current credentials
      this.transporter = this.createTransporter();

      await this.transporter.verify();
      logger.info('Email configuration is valid');
      return {
        success: true,
        message: 'Email configuration is valid',
        email: process.env.EMAIL_USER.includes('@')
          ? process.env.EMAIL_USER
          : `${process.env.EMAIL_USER}@gmail.com`
      };
    } catch (error) {
      logger.error('Email configuration test failed', {
        error: error.message,
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response
      });

      let message = 'Email configuration test failed';
      const troubleshooting = [];

      if (error.code === 'EAUTH' || error.responseCode === 535) {
        message = 'Email authentication failed';
        troubleshooting.push(
          '• Verify EMAIL_USER is the full email address (e.g., yourname@gmail.com)',
          '• Ensure you\'re using an App Password (16 characters, no spaces)',
          '• Make sure 2-Step Verification is enabled',
          '• Generate new App Password: https://myaccount.google.com/apppasswords',
          '• Check that EMAIL_PASS contains only the app password (no extra characters)'
        );
      } else if (error.code === 'ECONNECTION') {
        message = 'Email connection failed';
        troubleshooting.push(
          '• Check your internet connection',
          '• Verify firewall settings allow SMTP connections',
          '• Try using a different network'
        );
      } else if (error.code === 'EADDRNOTAVAIL') {
        message = 'Email server unavailable';
        troubleshooting.push(
          '• Check your email configuration',
          '• Verify SMTP server address is correct',
          '• Try again in a few minutes'
        );
      }

      return {
        success: false,
        message,
        error: error.message,
        troubleshooting: troubleshooting.length > 0 ? troubleshooting : undefined,
        code: error.code,
        responseCode: error.responseCode
      };
    }
  }

  // Get email configuration info (without sensitive data)
  getConfigInfo() {
    return {
      hasEmailUser: !!process.env.EMAIL_USER,
      hasEmailPass: !!process.env.EMAIL_PASS,
      hasSmtpHost: !!process.env.SMTP_HOST,
      hasSmtpUser: !!process.env.SMTP_USER,
      hasSmtpPass: !!process.env.SMTP_PASS,
      appName: process.env.APP_NAME || 'Jaaiye'
    };
  }
}

module.exports = new EmailService();