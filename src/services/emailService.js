const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const templates = require('../emails/templates');
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    // Try different configurations based on environment
    const configs = [
      // Gmail with OAuth2 (recommended)
      {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS // This should be an App Password
        },
        secure: true,
        port: 465
      },
      // Gmail with less secure settings (fallback)
      {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      },
      // Alternative: Use a different SMTP service if configured
      process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER,
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
        }
      } : null
    ].filter(Boolean);

    // Try each configuration
    for (const config of configs) {
      try {
        const transporter = nodemailer.createTransport(config);
        logger.info('Email transporter created successfully', {
          service: config.service || config.host,
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

    // Fallback to basic configuration
    logger.warn('Using fallback email configuration');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
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
      const mailOptions = {
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
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
        subject
      });
      return info;
    } catch (error) {
      logger.error('Error sending email', {
        error: error.message,
        stack: error.stack,
        to,
        subject,
        code: error.code,
        command: error.command
      });

      // Provide more specific error messages
      if (error.code === 'EAUTH') {
        throw new Error('Email authentication failed. Please check your email credentials and ensure you\'re using an App Password for Gmail.');
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

  // New method for sending report emails
  async sendPaymentConfirmationEmail(userOrEmail, ticket) {
    const email = typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;

    if (!email) {
      throw new Error('Email is required');
    }

    const html = templates.paymentConfirmationEmail({ ticket });
    const text = `Payment Confirmed! Your Tickets are Ready`;

    return this.sendEmail({
      to: email,
      subject: `Payment Confirmed! Your Tickets are Ready`,
      html,
      text
    });
  }

  // Test email configuration
  async testConnection() {
    try {
      await this.transporter.verify();
      logger.info('Email configuration is valid');
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      logger.error('Email configuration test failed', {
        error: error.message,
        code: error.code,
        command: error.command
      });

      let message = 'Email configuration test failed';
      if (error.code === 'EAUTH') {
        message = 'Email authentication failed. Please check your credentials and ensure you\'re using an App Password for Gmail.';
      } else if (error.code === 'ECONNECTION') {
        message = 'Email connection failed. Please check your internet connection and firewall settings.';
      } else if (error.code === 'EADDRNOTAVAIL') {
        message = 'Email server unavailable. Please check your email configuration.';
      }

      return { success: false, message, error: error.message };
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