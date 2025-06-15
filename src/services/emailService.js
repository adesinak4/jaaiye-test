const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async sendEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME}" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        text
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { messageId: info.messageId, to });
      return info;
    } catch (error) {
      logger.error('Error sending email', { error: error.message, stack: error.stack, to });
      next(error);
    }
  }

  async sendVerificationEmail(email, verificationCode) {
    const html = `
      <h1>Welcome to ${process.env.APP_NAME}!</h1>
      <p>Your verification code is:</p>
      <div style="
        font-size: 24px;
        font-weight: bold;
        letter-spacing: 2px;
        margin: 20px 0;
      ">${verificationCode}</div>
      <p>Enter this code in the app to verify your email address.</p>
      <p><em>This code expires in 10 minutes.</em></p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    const text = `
      Welcome to ${process.env.APP_NAME}!
      Your verification code is: ${verificationCode}
      Enter this code in the app to verify your email address.
      Code expires in 10 minutes.
      If you didn't request this, please ignore this email.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Email',
      html,
      text
    });
  }

  async sendPasswordResetEmail(user, resetCode) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?code=${resetCode}`;

    const html = `
      <h1>Password Reset Request</h1>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>If you did not request a password reset, please ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `;

    const text = `
      Password Reset Request
      You requested a password reset. Visit this link to reset your password: ${resetUrl}
      If you did not request a password reset, please ignore this email.
      This link will expire in 1 hour.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html,
      text
    });
  }

  async sendAccountDeactivationEmail(user) {
    const reactivationUrl = `${process.env.FRONTEND_URL}/reactivate-account`;

    const html = `
      <h1>Account Deactivated</h1>
      <p>Your account has been deactivated. You can reactivate it at any time by clicking the link below:</p>
      <a href="${reactivationUrl}">Reactivate Account</a>
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

  async sendAccountReactivatedEmail(user) {
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

  async sendWelcomeEmail(user) {
    const html = `
      <h1>Welcome to ${process.env.APP_NAME}!</h1>
      <p>Thank you for joining us. We're excited to have you on board!</p>
      <p>You can now start using all our features:</p>
      <ul>
        <li>Create and manage calendars</li>
        <li>Schedule events</li>
        <li>Share with others</li>
        <li>And much more!</li>
      </ul>
      <p>If you have any questions, feel free to contact our support team.</p>
    `;

    const text = `
      Welcome to ${process.env.APP_NAME}!
      Thank you for joining us. We're excited to have you on board!
      You can now start using all our features:
      - Create and manage calendars
      - Schedule events
      - Share with others
      - And much more!
      If you have any questions, feel free to contact our support team.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Welcome to ' + process.env.APP_NAME,
      html,
      text
    });
  }
}

module.exports = new EmailService();