export const RUN_CANCELLED_MESSAGE = 'Run cancelled.';

export class RunCancelledError extends Error {
  constructor(message: string = RUN_CANCELLED_MESSAGE) {
    super(message);
    this.name = 'RunCancelledError';
  }
}
