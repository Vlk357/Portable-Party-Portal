export class DeliveryStatusError extends Error {
  constructor(
    public readonly operation: string,
    public readonly messageId?: number,
    public readonly userId?: number,
    public readonly cause?: Error,
  ) {
    const context = [
      messageId && `messageId: ${messageId}`,
      userId && `userId: ${userId}`,
    ]
      .filter(Boolean)
      .join(', ');

    super(`Failed to ${operation}${context ? ` (${context})` : ''}`);
    this.name = 'DeliveryStatusError';
  }
}
