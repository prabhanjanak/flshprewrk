import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
const DB_PATH = path.join(process.cwd(), "tv-access.json");

async function getAccessCode(): Promise<string> {
  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(data).code;
  } catch {
    const defaultCode = generateCode();
    await fs.writeFile(DB_PATH, JSON.stringify({ code: defaultCode }));
    return defaultCode;
  }
}

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

router.post("/tv-access/verify", async (req, res) => {
  const { code } = req.body;
  const currentCode = await getAccessCode();
  if (code && code.toUpperCase() === currentCode) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid access code" });
  }
});

router.get("/tv-access/code", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const code = await getAccessCode();
  res.json({ code });
});

router.post("/tv-access/code/generate", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const newCode = generateCode();
  await fs.writeFile(DB_PATH, JSON.stringify({ code: newCode }));
  res.json({ code: newCode });
});

export default router;
