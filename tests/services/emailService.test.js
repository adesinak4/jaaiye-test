// Mock nodemailer before requiring the service
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('EmailService', () => {
  let mockTransporter;
  let emailService;
  let nodemailer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
    };

    // Get the mocked nodemailer
    nodemailer = require('nodemailer');
    nodemailer.createTransport.mockReturnValue(mockTransporter);

    // Re-require the service to get a fresh instance
    jest.resetModules();
    emailService = require('../../src/services/emailService');
  });

  describe('sendEmail', () => {
    test('should send email successfully', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Test content'
      };

      const mockInfo = {
        messageId: 'test-message-id',
        response: 'OK'
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      const result = await emailService.sendEmail(emailData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text
      });

      expect(result).toEqual(mockInfo);
    });

    test('should handle email sending errors', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Test content'
      };

      const error = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValue(error);

      await expect(emailService.sendEmail(emailData))
        .rejects.toThrow('SMTP connection failed');
    });
  });

  describe('sendVerificationEmail', () => {
    test('should send verification email with user object', async () => {
      const user = {
        email: 'test@example.com',
        verificationCode: '123456'
      };

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendVerificationEmail(user);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Verify Your Email',
        html: expect.stringContaining('123456'),
        text: expect.stringContaining('123456')
      });
    });

    test('should send verification email with individual parameters', async () => {
      const email = 'test@example.com';
      const code = '654321';

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendVerificationEmail(email, code);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify Your Email',
        html: expect.stringContaining(code),
        text: expect.stringContaining(code)
      });
    });

    test('should handle missing email or code', async () => {
      await expect(emailService.sendVerificationEmail('', '123456'))
        .rejects.toThrow('Email and verification code are required');

      await expect(emailService.sendVerificationEmail('test@example.com', ''))
        .rejects.toThrow('Email and verification code are required');
    });
  });

  describe('sendPasswordResetEmail', () => {
    test('should send password reset email with user object', async () => {
      const user = {
        email: 'test@example.com',
        resetPasswordCode: '123456'
      };

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendPasswordResetEmail(user);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Reset Your Password',
        html: expect.stringContaining('123456'),
        text: expect.stringContaining('123456')
      });
    });

    test('should send password reset email with individual parameters', async () => {
      const email = 'test@example.com';
      const code = '654321';

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendPasswordResetEmail(email, code);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Reset Your Password',
        html: expect.stringContaining(code),
        text: expect.stringContaining(code)
      });
    });

    test('should handle missing email or code', async () => {
      await expect(emailService.sendPasswordResetEmail('', '123456'))
        .rejects.toThrow('Email and reset code are required');

      await expect(emailService.sendPasswordResetEmail('test@example.com', ''))
        .rejects.toThrow('Email and reset code are required');
    });
  });

  describe('sendWelcomeEmail', () => {
    test('should send welcome email with user object', async () => {
      const user = {
        email: 'test@example.com',
        fullName: 'Test User'
      };

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendWelcomeEmail(user);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Welcome to Jaaiye!',
        html: expect.stringContaining('Test User'),
        text: expect.stringContaining('Test User')
      });
    });

    test('should send welcome email with email parameter', async () => {
      const email = 'test@example.com';

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendWelcomeEmail(email);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to Jaaiye!',
        html: expect.stringContaining('Welcome'),
        text: expect.stringContaining('Welcome')
      });
    });
  });

  describe('sendReportEmail', () => {
    test('should send report email', async () => {
      const user = {
        email: 'test@example.com',
        fullName: 'Test User'
      };

      const reportData = {
        type: 'user_activity',
        period: 'weekly',
        data: { events: 10, participants: 25 }
      };

      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await emailService.sendReportEmail(user, reportData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: `"${process.env.APP_NAME || 'Jaaiye'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Your Weekly Report',
        html: expect.stringContaining('user_activity'),
        text: expect.stringContaining('user_activity')
      });
    });
  });

  describe('Environment Variables', () => {
    test('should use environment variables for configuration', () => {
      // The service should be initialized with environment variables
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    });
  });
});