import { Router } from "express";
import { insert, update } from "../db/client.js";
import { nowIso } from "../util.js";

export const sessionsRouter = Router();

sessionsRouter.post("/sessions", (req, res) => {
  const body = req.body || {};
  const row = insert("sessions", {
    tracking_enabled: 1,
    app_version: body.appVersion || "0.1.0",
    user_agent: body.userAgent || "",
    initial_number_of_other_players: body.settings?.numberOfOtherPlayers,
    initial_shoe_display_mode: body.settings?.shoeDisplayMode,
    settings_json: JSON.stringify(body.settings || {})
  });
  res.status(201).json({ id: row.id, trackingEnabled: true });
});

sessionsRouter.patch("/sessions/:id", (req, res) => {
  const body = req.body || {};
  const values: Record<string, unknown> = {};
  if (typeof body.trackingEnabled === "boolean")
    values.tracking_enabled = body.trackingEnabled ? 1 : 0;
  if (body.ended) values.ended_at = nowIso();
  update("sessions", Number(req.params.id), values);
  res.status(200).json({ ok: true });
});
