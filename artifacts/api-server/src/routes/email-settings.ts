import { Router } from "express";
import { db, emailSettingsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";
import nodemailer from "nodemailer";

const router = Router();

// Get settings
router.get("/settings/email", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  if (!settings) {
    // Return empty defaults if not configured
    return res.json({
      enabled: false, host: "", port: "587", user: "", pass: "", useSsl: false,
      fromName: "Sankara Academy of Vision", fromEmail: ""
    });
  }
  res.json(settings);
});

// Update settings
router.patch("/settings/email", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const data = req.body;
  const [existing] = await db.select().from(emailSettingsTable).limit(1);
  
  if (existing) {
    const [updated] = await db.update(emailSettingsTable).set({
      ...data, updatedAt: new Date()
    }).where({ id: existing.id } as any).returning(); // using any for ID shorthand
    res.json(updated);
  } else {
    const [inserted] = await db.insert(emailSettingsTable).values({
      ...data
    }).returning();
    res.json(inserted);
  }
});

// Test settings
router.post("/settings/email/test", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const { to } = req.body;
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  
  if (!settings || !settings.host || !settings.user || !settings.pass) {
    return res.status(400).json({ error: "SMTP settings not fully configured yet" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: Number(settings.port),
      secure: settings.useSsl || Number(settings.port) === 465,
      auth: { user: settings.user, pass: settings.pass }
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"${settings.fromName}" <${settings.fromEmail || settings.user}>`,
      to,
      subject: "Test Email from Sankara Academy",
      text: "This is a test email to verify your SMTP configuration is working correctly.",
      html: "<p>This is a test email to verify your SMTP configuration is working correctly.</p>"
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send test email" });
  }
});

export default router;
