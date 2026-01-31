import { Alarm, DeliveryResult } from '../types';

export abstract class BaseChannel {
  name: string;
  initialized: boolean = false;

  constructor(name: string) {
    this.name = name;
  }

  abstract initialize(): Promise<void>;
  abstract send(alarm: Alarm, recipients: string[]): Promise<DeliveryResult>;
  abstract validateRecipients(recipients: string[]): { valid: string[]; invalid: string[] };

  async close(): Promise<void> {
    // Override if cleanup needed
  }

  isReady(): boolean {
    return this.initialized;
  }
}
