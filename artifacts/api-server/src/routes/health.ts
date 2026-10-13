import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSystemNetworkIp } from "../lib/network";
import { getPoolMetrics } from "@workspace/db";

const router: IRouter = Router();

router.get(["/health", "/healthz"], (_req, res) => {
  try {
    const metrics = getPoolMetrics();
    res.json({ status: "ok", pool: metrics });
  } catch (e) {
    res.json({ status: "ok", error: String(e) });
  }
});

router.get("/system-ip", async (_req, res) => {
  try {
    const ip = await getSystemNetworkIp();
    res.json({ ip });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

