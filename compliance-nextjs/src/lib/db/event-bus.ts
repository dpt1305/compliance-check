import { EventEmitter } from 'events';

export type DataScope = 'tracking' | 'submissions' | 'attendance';

export interface ChangeEvent {
  scope: DataScope;
  ts: number;
}

// Singleton — reuse across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _eventBus: EventEmitter | undefined;
}

function createBus(): EventEmitter {
  const bus = new EventEmitter();
  bus.setMaxListeners(500); // allow many concurrent SSE clients
  return bus;
}

export const eventBus: EventEmitter =
  globalThis._eventBus ?? (globalThis._eventBus = createBus());

/** Broadcast a data-change event to all connected SSE clients. */
export function emitChange(scope: DataScope): void {
  const event: ChangeEvent = { scope, ts: Date.now() };
  eventBus.emit('change', event);
}
