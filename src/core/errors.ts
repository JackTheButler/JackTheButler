/**
 * Domain error. Services throw these; the HTTP layer (core/http.ts) is the
 * single place that turns them into responses — so services never format
 * HTTP and error shaping is never duplicated across routes.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    /** Optional structured detail (e.g. per-field validation messages). */
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = 'AppError';
  }
}
