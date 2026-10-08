import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { reportError } from './monitoring';

/** Error codes shared with the app (envelope { ok: false, error: { code, message, details } }). */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'dates_taken'
  | 'too_many_requests'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  dates_taken: 409,
  too_many_requests: 429,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export function ok<T>(reply: FastifyReply, data: T, status = 200) {
  return reply.status(status).send({ ok: true, data });
}

export function sendError(reply: FastifyReply, err: unknown, route?: string) {
  if (err instanceof ApiError) {
    return reply.status(err.status).send({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return reply.status(422).send({ ok: false, error: { code: 'bad_request', message: 'Invalid input', details: err.flatten() } });
  }
  const e = err as { statusCode?: number; message?: string; code?: string };
  if (e.statusCode === 429) {
    return reply.status(429).send({ ok: false, error: { code: 'too_many_requests', message: 'Too many requests' } });
  }
  if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
    return reply.status(e.statusCode).send({ ok: false, error: { code: 'bad_request', message: e.message ?? 'Bad request' } });
  }
  reply.log.error(err);
  reportError(err, { route });
  return reply.status(500).send({ ok: false, error: { code: 'internal', message: 'Internal error' } });
}

export function notFound(what = 'Not found'): never {
  throw new ApiError('not_found', what);
}
