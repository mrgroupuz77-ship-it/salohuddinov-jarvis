export class NotConnectedError extends Error {
  integration: string;
  constructor(integration: string, hint: string) {
    super(`${integration} ulanmagan. ${hint}`);
    this.integration = integration;
  }
}
