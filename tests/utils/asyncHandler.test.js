const { asyncHandler, requestLogger } = require('../../src/utils/asyncHandler');
const logger = require('../../src/utils/logger');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('AsyncHandler', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      method: 'GET',
      url: '/api/test',
      headers: { 'user-agent': 'test-agent' },
      body: {},
      query: {},
      params: {},
      ip: '127.0.0.1'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('asyncHandler', () => {
    test('should handle successful async function', async () => {
      const testFunction = async (req, res) => {
        res.status(200).json({ success: true });
      };

      const wrappedFunction = asyncHandler(testFunction);

      await wrappedFunction(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle synchronous function', async () => {
      const testFunction = (req, res) => {
        res.status(200).json({ success: true });
      };

      const wrappedFunction = asyncHandler(testFunction);

      await wrappedFunction(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    test('should pass error to next middleware', async () => {
      const testFunction = async () => {
        throw new Error('Test error');
      };

      const wrappedFunction = asyncHandler(testFunction);

      await wrappedFunction(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Test error');
    });

    test('should handle custom errors', async () => {
      const customError = new Error('Custom error');
      customError.statusCode = 400;

      const testFunction = async () => {
        throw customError;
      };

      const wrappedFunction = asyncHandler(testFunction);

      await wrappedFunction(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(customError);
    });
  });

  describe('requestLogger', () => {
    test('should log request details', () => {
      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(startTime);

      requestLogger(mockReq, mockRes, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          userAgent: 'test-agent',
          ip: '127.0.0.1'
        })
      );

      expect(mockNext).toHaveBeenCalled();
    });

    test('should log response details', () => {
      const startTime = Date.now();
      const endTime = startTime + 100;

      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      requestLogger(mockReq, mockRes, mockNext);

      // Simulate response end
      const responseEndCallback = mockRes.on.mock.calls.find(call => call[0] === 'finish')[1];
      responseEndCallback();

      expect(logger.info).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          statusCode: undefined,
          duration: 100
        })
      );
    });

    test('should handle missing headers', () => {
      mockReq.headers = {};

      requestLogger(mockReq, mockRes, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          userAgent: undefined,
          ip: '127.0.0.1'
        })
      );
    });

    test('should handle missing IP', () => {
      delete mockReq.ip;

      requestLogger(mockReq, mockRes, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          userAgent: 'test-agent',
          ip: undefined
        })
      );
    });

    test('should handle response errors', () => {
      const startTime = Date.now();
      const endTime = startTime + 100;

      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      requestLogger(mockReq, mockRes, mockNext);

      // Simulate response error
      const responseErrorCallback = mockRes.on.mock.calls.find(call => call[0] === 'error')[1];
      const error = new Error('Response error');
      responseErrorCallback(error);

      expect(logger.error).toHaveBeenCalledWith(
        'Response error',
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          error: error.message
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle non-function input', () => {
      const wrappedFunction = asyncHandler('not a function');

      expect(() => wrappedFunction(mockReq, mockRes, mockNext))
        .toThrow();
    });

    test('should handle function that returns non-promise', () => {
      const testFunction = (req, res) => {
        return 'not a promise';
      };

      const wrappedFunction = asyncHandler(testFunction);

      expect(() => wrappedFunction(mockReq, mockRes, mockNext))
        .not.toThrow();
    });
  });
});