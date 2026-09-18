import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Runs the serverless API inside the Vite dev server, so `npm run dev` gives a
// working full-stack app locally without needing the Vercel CLI.
//
// It loads the same catch-all dispatcher Vercel deploys, rather than reaching
// into api/_handlers/ itself, so a route missing from the dispatcher's table
// fails here exactly as it would in production instead of only in deployment.
const API_DISPATCHER = '/api/[...path].js';

function apiDevMiddleware() {
  return {
    name: 'local-api-functions',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');

        let mod;
        try {
          mod = await server.ssrLoadModule(API_DISPATCHER);
        } catch (err) {
          res.statusCode = 500;
          res.end(`Could not load ${API_DISPATCHER}: ${err.message}`);
          return;
        }

        // Vercel hands the catch-all its matched segments as req.query.path;
        // mirror that so the dispatcher takes the same branch in both places.
        req.query = {
          ...Object.fromEntries(url.searchParams),
          path: url.pathname.replace('/api/', '').split('/').filter(Boolean),
        };
        if (req.method === 'POST' && String(req.headers['content-type'] || '').includes('application/json')) {
          try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString('utf8');
            req.body = body ? JSON.parse(body) : {};
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }
        }
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        try {
          await mod.default(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Local API function crashed', detail: String(err) }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [react(), apiDevMiddleware()],
  };
})
