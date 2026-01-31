import { BaseChannel } from './baseChannel';
import { EmailChannel } from './emailChannel';
import { SmsChannel } from './smsChannel';
import { VoiceChannel } from './voiceChannel';
import logger from '../utils/logger';

class ChannelRegistry {
  private channels: Map<string, BaseChannel> = new Map();

  register(channel: BaseChannel): void {
    this.channels.set(channel.name, channel);
    logger.info(`Registered channel: ${channel.name}`);
  }

  get(name: string): BaseChannel | undefined {
    return this.channels.get(name);
  }

  async initializeAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [name, channel] of this.channels) {
      logger.info(`Initializing channel: ${name}`);
      promises.push(
        channel.initialize().catch(error => {
          logger.error(`Failed to initialize channel ${name}:`, error);
        })
      );
    }
    await Promise.all(promises);
    logger.info('All channels initialized');
  }

  async closeAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [name, channel] of this.channels) {
      promises.push(
        channel.close().catch(error => {
          logger.error(`Failed to close channel ${name}:`, error);
        })
      );
    }
    await Promise.all(promises);
    logger.info('All channels closed');
  }

  getAvailableChannels(): string[] {
    const available: string[] = [];
    for (const [name, channel] of this.channels) {
      if (channel.isReady()) {
        available.push(name);
      }
    }
    return available;
  }
}

const registry = new ChannelRegistry();
registry.register(new EmailChannel());
registry.register(new SmsChannel());
registry.register(new VoiceChannel());

export default registry;
