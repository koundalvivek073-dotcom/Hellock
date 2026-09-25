import { EventEmitter } from 'events';

/**
 * EventBus provides a centralized publish/subscribe hub for system events.
 * It broadcasts events to connected dashboard clients (via SSE) and prints
 * formatted, color-coded console logs for live terminal demonstrations.
 */
class SystemEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.eventHistory = [];
    this.maxHistory = 150;
  }

  /**
   * Broadcasts an event, buffers it in history, and logs to terminal.
   * @param {string} type 
   * @param {object} payload 
   */
  emitEvent(type, payload = {}) {
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      timestamp: new Date().toISOString(),
      ...payload
    };

    // Store in circular buffer for initial client hydration
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.pop();
    }

    // Color-coded terminal console logs for live hackathon presentation
    this.logToConsole(event);

    // Emit to active SSE subscribers
    this.emit('system_event', event);
    return event;
  }

  getHistory() {
    return [...this.eventHistory];
  }

  logToConsole(event) {
    const time = new Date().toLocaleTimeString();
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const red = '\x1b[31m';
    const magenta = '\x1b[35m';
    const blue = '\x1b[34m';
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';

    let tag = `[${event.type}]`;
    let color = cyan;

    if (event.type.includes('CONFIRMED_DOWN') || event.type.includes('CORRUPT') || event.type.includes('FAIL')) {
      color = red;
    } else if (event.type.includes('SUSPECTED') || event.type.includes('WARN')) {
      color = yellow;
    } else if (event.type.includes('RECOVERY') || event.type.includes('HEAL') || event.type.includes('REPAIR')) {
      color = magenta;
    } else if (event.type.includes('SUCCESS') || event.type.includes('VERIFIED') || event.type.includes('HEALTHY')) {
      color = green;
    } else if (event.type.includes('UPLOAD') || event.type.includes('WRITE')) {
      color = blue;
    }

    const message = event.message || JSON.stringify(event.payload || {});
    console.log(`${bold}[VAULT ${time}]${reset} ${color}${bold}${tag}${reset} ${message}`);
  }
}

// Global singleton instance across Next.js API requests
const globalEventBus = global._vaultEventBus || new SystemEventBus();
if (process.env.NODE_ENV !== 'production') {
  global._vaultEventBus = globalEventBus;
}

export default globalEventBus;
