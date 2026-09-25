import eventBus from '@/services/eventBus';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const initialMsg = `data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Stream Connected to Vault Node Cluster', timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(initialMsg));

      const onSystemEvent = (event) => {
        try {
          const sseMsg = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseMsg));
        } catch (e) {
          // stream closed
        }
      };

      eventBus.on('system_event', onSystemEvent);

      // Keep connection alive with periodic comment pings
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        eventBus.off('system_event', onSystemEvent);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  });
}
