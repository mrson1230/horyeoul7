import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiHandler = (req: IncomingMessage, res: ServerResponse) => void;

let cachedHandler: ApiHandler | null = null;

async function resolveHandler(): Promise<ApiHandler> {
  if (cachedHandler) return cachedHandler;
  const mod = await import('../server.js');
  const handler =
    (mod.handleVercelApi as ApiHandler | undefined) ||
    (mod.default as ApiHandler | undefined);
  if (typeof handler !== 'function') {
    throw new Error('Server API handler export was not found');
  }
  cachedHandler = handler;
  return handler;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const fn = await resolveHandler();
    fn(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '');
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : 'SERVER_BOOT_ERROR';
    console.error('[Vercel /api/[...path] Boot Error]', {
      url: req.url,
      code,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          code,
          error: `서버 초기화 중 오류가 발생했습니다. (${code}: ${message})`,
        })
      );
    }
  }
}
