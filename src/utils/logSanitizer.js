const SENSITIVE_KEYS = new Set([
  'password','pass','pwd','authorization','token','accessToken','refreshToken',
  'verificationCode','resetPasswordCode','code','secret','privateKey','apiKey',
  'clientSecret','email','to','subject'
].map(k => k.toLowerCase()));

const MAX_STRING_LENGTH = 500;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function redact(value) {
  return '[REDACTED]';
}

function truncateString(str) {
  if (typeof str !== 'string') return str;
  if (str.length <= MAX_STRING_LENGTH) return str;
  return str.slice(0, MAX_STRING_LENGTH) + `...(${str.length - MAX_STRING_LENGTH} more chars)`;
}

function sanitizeLogData(input, options = {}) {
  const { keepBodyKeysOnly = true } = options;

  if (input == null) return input;

  if (Array.isArray(input)) {
    return input.map(item => sanitizeLogData(item, options));
  }

  if (isPlainObject(input)) {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();

      if (SENSITIVE_KEYS.has(lowerKey)) {
        output[key] = redact(value);
        continue;
      }

      if (lowerKey === 'body') {
        if (keepBodyKeysOnly && isPlainObject(value)) {
          output.body = { keys: Object.keys(value) };
        } else {
          output.body = '[OMITTED]';
        }
        continue;
      }

      if (lowerKey === 'headers') {
        // Only keep a safe subset of headers
        const headers = value && isPlainObject(value) ? value : {};
        const picked = {};
        for (const h of ['user-agent','content-type']) {
          if (headers[h]) picked[h] = headers[h];
        }
        output.headers = picked;
        continue;
      }

      if (typeof value === 'string') {
        output[key] = truncateString(value);
      } else {
        output[key] = sanitizeLogData(value, options);
      }
    }
    return output;
  }

  if (typeof input === 'string') {
    return truncateString(input);
  }

  return input;
}

module.exports = { sanitizeLogData };