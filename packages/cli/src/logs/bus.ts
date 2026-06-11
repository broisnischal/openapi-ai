import type { ServerWebSocket } from 'bun';

export interface LogEvent {
  id: string;
  source: string;
  tool_name: string | null;
  method: string;
  url: string;
  request_headers: string | null;
  request_body: string | null;
  status_code: number | null;
  response_headers: string | null;
  response_body: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: number;
}

class LogBus {
  private clients = new Set<ServerWebSocket<unknown>>();
  private listeners = new Set<(e: LogEvent) => void>();

  subscribe(ws: ServerWebSocket<unknown>): void {
    this.clients.add(ws);
  }

  unsubscribe(ws: ServerWebSocket<unknown>): void {
    this.clients.delete(ws);
  }

  /** In-process listener (e.g. the /tail slash command). Returns unsubscribe. */
  onEvent(fn: (e: LogEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: LogEvent): void {
    for (const fn of this.listeners) {
      try { fn(event); } catch { /* listener errors must not break request handling */ }
    }
    if (this.clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const ws of this.clients) {
      try { ws.send(payload); } catch { this.clients.delete(ws); }
    }
  }

  /** Push a non-log server event to all connected studio clients. */
  broadcastServerEvent(payload: Record<string, unknown>): void {
    if (this.clients.size === 0) return;
    const data = JSON.stringify({ type: 'server_event', ...payload });
    for (const ws of this.clients) {
      try { ws.send(data); } catch { this.clients.delete(ws); }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const logBus = new LogBus();

export function logsUpgradeHandler(req: Request, server: import('bun').Server<unknown>): Response | undefined {
  if (!server.upgrade(req, { data: null })) return new Response('WebSocket upgrade failed', { status: 426 });
  return undefined;
}

export const logsWebSocketHandlers = {
  open(ws: ServerWebSocket<unknown>) {
    logBus.subscribe(ws);
    ws.send(JSON.stringify({ type: 'connected', clientCount: logBus.clientCount }));
  },
  message(_ws: ServerWebSocket<unknown>, _msg: string | Buffer) {},
  close(ws: ServerWebSocket<unknown>) {
    logBus.unsubscribe(ws);
  },
};
