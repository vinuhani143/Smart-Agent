export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    const firstLine = error.message.split('\n')[0]?.trim() ?? '';
    if (!firstLine || firstLine.length > 240 || /at\s+\S+\s+\(/.test(firstLine)) {
      return 'Something went wrong. Please try again.';
    }
    return firstLine;
  }
  return 'Something went wrong. Please try again.';
}
