import { Hono } from 'hono';
import { apiRoutes, hostGuard, jsonOnly } from './routes';
import type { ApiDeps } from './routes';

/** Dependencies injected into the app. Without them only the health check is served (as in the scaffold test). */
export interface AppDeps extends ApiDeps {
  /** The Google OAuth routes (GET only, so exempt from the JSON rule). Build them with `onSignedIn` so a successful callback refreshes Gmail. */
  oauth?: Hono;
}

export function createApp(deps?: AppDeps): Hono {
  const app = new Hono();
  if (deps) {
    app.use('*', hostGuard(deps.port));
    app.use('*', jsonOnly);
  }
  app.get('/api/health', (c) => c.json({ ok: true }));
  if (!deps) return app;

  if (deps.oauth) {
    app.route('/', deps.oauth);
  }
  app.route('/', apiRoutes(deps));
  return app;
}
