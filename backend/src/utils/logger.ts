type LogLevel = 'info' | 'warn' | 'error';

const SECRET_KEYS = /token|secret|password|authorization|cookie|refresh|bearer|client_secret|x-api-key|securityprofile|code_verifier|authorization_code|private_key|api_key|database_url/i;

export function redactLogMeta(value: unknown): unknown {
  return redact(value);
}

function redact(value: unknown): unknown {
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
