export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
