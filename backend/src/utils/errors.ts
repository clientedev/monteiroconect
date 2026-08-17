export class AppError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}
