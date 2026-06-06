import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { CLIENT_DIST, DEV_CLIENT_PORT } from "./config.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { eventsRouter } from "./routes/events.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { strategyRouter } from "./routes/strategy.routes.js";

const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  res.status(500).json({ error: "Internal server error", detail: (err as Error)?.message });
};

function devClientRedirectUrl(req: express.Request): string {
  const host = req.hostname.includes(":") ? `[${req.hostname}]` : req.hostname;
  return `${req.protocol}://${host}:${DEV_CLIENT_PORT}${req.originalUrl}`;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", sessionsRouter);
  app.use("/api", strategyRouter);
  app.use("/api", eventsRouter);
  app.use("/api", analyticsRouter);

  // Unknown API route -> JSON 404 (matches legacy behavior).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Dev: 5173 is the API server. Redirect UI routes to Vite so users do not
  // accidentally use a stale production build while editing features.
  if (DEV_CLIENT_PORT) {
    app.get("*", (req, res) => {
      res.redirect(307, devClientRedirectUrl(req));
    });
  } else if (fs.existsSync(CLIENT_DIST)) {
    // Production build: serve the compiled client and fall back to index.html so
    // client-side routes survive a refresh.
    app.use(express.static(CLIENT_DIST));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }

  app.use(jsonErrorHandler);
  return app;
}
