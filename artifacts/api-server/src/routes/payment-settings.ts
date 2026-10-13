import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, paymentSettingsTable, programsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

// GET /payment-settings — list all configurations (admin only)
router.get(
  "/payment-settings",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (_req, res) => {
    const settings = await db.select().from(paymentSettingsTable).orderBy(paymentSettingsTable.id);
    const programs = await db.select().from(programsTable);
    const out = settings.map((s) => ({
      ...s,
      programName: s.programId ? (programs.find((p) => p.id === s.programId)?.name ?? null) : null,
      amountRs: s.amount / 100,
    }));
    res.json(out);
  }
);

// POST /payment-settings — create a new configuration
router.post(
  "/payment-settings",
  requireAuth,
  requireRole("super_admin", "program_admin"),
  async (req, res) => {
    const { programId, razorpayKeyId, razorpayKeySecret, amountRs, currency, description, mode, isActive } =
      req.body as {
        programId?: number | null;
        razorpayKeyId?: string;
        razorpayKeySecret?: string;
        amountRs: number;
        currency?: string;
        description?: string;
        mode?: string;
        isActive?: boolean;
      };

    const { upiId } = req.body as { upiId?: string };
    const [setting] = await db.insert(paymentSettingsTable).values({
      programId: programId ?? null,
      razorpayKeyId: razorpayKeyId ?? null,
      razorpayKeySecret: razorpayKeySecret ?? null,
      amount: Math.round((amountRs ?? 2750) * 100),
      currency: currency ?? "INR",
      description: description ?? "Fellowship Application Fee",
      mode: mode ?? "test",
      upiId: upiId ?? null,
      isActive: isActive ?? true,
    }).returning();

    res.status(201).json({ ...setting, amountRs: (setting!.amount / 100) });
  }
);

// PATCH /payment-settings/:id — update a configuration
router.patch(
  "/payment-settings/:id",
  requireAuth,
  requireRole("super_admin", "program_admin"),
  async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (body["programId"] !== undefined) update["programId"] = body["programId"] ?? null;
    if (body["razorpayKeyId"] !== undefined) update["razorpayKeyId"] = body["razorpayKeyId"];
    if (body["razorpayKeySecret"] !== undefined) update["razorpayKeySecret"] = body["razorpayKeySecret"];
    if (body["amountRs"] !== undefined) update["amount"] = Math.round(Number(body["amountRs"]) * 100);
    if (body["currency"] !== undefined) update["currency"] = body["currency"];
    if (body["description"] !== undefined) update["description"] = body["description"];
    if (body["mode"] !== undefined) update["mode"] = body["mode"];
    if (body["upiId"] !== undefined) update["upiId"] = body["upiId"] ?? null;
    if (body["isActive"] !== undefined) update["isActive"] = body["isActive"];

    const [updated] = await db.update(paymentSettingsTable).set(update).where(eq(paymentSettingsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, amountRs: updated.amount / 100 });
  }
);

// DELETE /payment-settings/:id
router.delete(
  "/payment-settings/:id",
  requireAuth,
  requireRole("super_admin", "program_admin"),
  async (req, res) => {
    const id = Number(req.params.id);
    await db.delete(paymentSettingsTable).where(eq(paymentSettingsTable.id, id));
    res.json({ success: true });
  }
);

// GET /payment-settings/active?programId=X — get active setting for a program (used by apply page)
router.get("/payment-settings/active", async (req, res) => {
  const programId = req.query["programId"] ? Number(req.query["programId"]) : null;
  const all = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.isActive, true));

  // Prefer program-specific, fall back to global (null programId)
  const specific = programId ? all.find((s) => s.programId === programId) : null;
  const global = all.find((s) => s.programId === null);
  const setting = specific ?? global ?? null;

  if (!setting) {
    return res.json({ mock: true, amount: 275000, currency: "INR", description: "Fellowship Application Fee" });
  }

  const hasCreds = !!(setting.razorpayKeyId && setting.razorpayKeySecret);
  res.json({
    mock: !hasCreds,
    keyId: hasCreds ? setting.razorpayKeyId : undefined,
    amount: setting.amount,
    currency: setting.currency,
    description: setting.description,
    mode: setting.mode,
    upiId: setting.upiId ?? undefined,
  });
});

export default router;
