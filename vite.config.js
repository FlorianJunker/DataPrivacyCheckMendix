import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// A dynamic dev-only proxy: requests to /__proxy?target=<encoded url> are
// forwarded server-side, sidestepping browser CORS while developing.
export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'dynamic-proxy',
      configureServer(server) {
        server.middlewares.use('/__proxy', async (req, res) => {
          try {
            const u = new URL(req.url, 'http://localhost');
            const target = u.searchParams.get('target');
            if (!target) {
              res.statusCode = 400;
              res.end('missing target');
              return;
            }
            const upstream = await fetch(target, {
              headers: { Accept: 'application/json' }
            });
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader(
              'Content-Type',
              upstream.headers.get('content-type') || 'text/plain'
            );
            res.end(body);
          } catch (err) {
            res.statusCode = 502;
            res.end('proxy error: ' + err.message);
          }
        });
      }
    }
  ]
});
