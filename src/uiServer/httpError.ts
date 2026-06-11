export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('cache entry not found')) {
    return new HttpError(404, 'CACHE_ENTRY_NOT_FOUND', message);
  }
  if (message.includes('cache entry update conflict')) {
    return new HttpError(409, 'CACHE_BODY_CONFLICT', message);
  }
  return new HttpError(500, 'CACHE_BODY_ERROR', message);
}
