import { eventBus } from '@/lib/db/event-bus';
import type { ChangeEvent } from '@/lib/db/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/events
 *
 * Server-Sent Events (SSE) endpoint.
 * Streams real-time data-change notifications to the admin UI.
 * Protected by the middleware JWT check (cookie or Authorization header).
 *
 * Event format:
 *   data: {"scope":"tracking","ts":1234567890}\n\n
 *   data: {"scope":"submissions","ts":1234567890}\n\n
 *
 * Heartbeat every 25s keeps proxies/load-balancers from closing the connection.
 */
export async function GET(req: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial "connected" comment so the client knows the stream is live
      controller.enqueue(encoder.encode(':connected\n\n'));

      const listener = (event: ChangeEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller already closed — listener will be removed by abort handler
        }
      };

      eventBus.on('change', listener);

      // Heartbeat: SSE comment lines keep the connection alive through proxies
      const heartbeatId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':\n\n'));
        } catch {
          clearInterval(heartbeatId);
        }
      }, 25_000);

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        eventBus.off('change', listener);
        clearInterval(heartbeatId);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx/caddy response buffering
    },
  });
}
