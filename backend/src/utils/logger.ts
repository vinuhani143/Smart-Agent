type LogLevel = 'info' | 'warn' | 'error';

const SECRET_KEYS = /token|secret|password|authorization|cookie|key|refresh|bearer|client_id|client_secret|x-api-key|securityprofile/i;

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 0 ? '[redacted]' : value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SECRET_KEYS.test(key) ? '[redacted]' : redact(nested),
    ]);
    return Object.fromEntries(entries);
  }
  return value;
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    write('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    write('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    write('error', message, meta);
  },
};
