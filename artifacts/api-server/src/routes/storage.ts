import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth, requireRole } from "../middleware/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import path from "path";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const { name, contentType, size } = (req.body ?? {}) as { name?: string; contentType?: string; size?: number };
  if (!name || typeof name !== "string" || !name.trim() || !contentType || typeof contentType !== "string") {
    res.status(400).json({ error: "Missing or invalid required fields: name, contentType" });
    return;
  }
  try {
    const isReplit = !!process.env.REPL_ID;
    if (!isReplit) {
      // Local fallback for Windows
      const objectId = Math.random().toString(36).substring(2, 10);
      const ext = name.split('.').pop() ?? "bin";
      const sanitizedName = name.split('.')[0].replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `${sanitizedName}_${objectId}.${ext}`;
      
      const uploadURL = `/api/storage/local-upload/${filename}`;
      const objectPath = `/objects/uploads/${filename}`;
      return res.json({ uploadURL, objectPath, metadata: { name: name.trim(), size, contentType } });
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name: name.trim(), size, contentType } });
  } catch (error) {
    req.log?.error?.({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

import { createWriteStream } from "fs";

router.put("/storage/local-upload/:filename", requireAuth, async (req: Request, res: Response) => {
  try {
    const uploadDir = path.join(process.cwd(), "uploads");
    const fsPromises = await import("fs/promises");
    await fsPromises.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, req.params.filename as string);
    const writeStream = createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on("finish", async () => {
      let finalFilename = req.params.filename as string;
      try {
        const { normalizeUploadedFile } = await import("../lib/image-normalizer");
        const normResult = await normalizeUploadedFile(filePath, req.params.filename as string);
        if (normResult?.normalizedPath) {
          finalFilename = path.basename(normResult.normalizedPath);
        }
      } catch (normErr) {
        console.warn("[storage-normalizer] Post-upload normalization skipped:", normErr);
      }
      res.json({ success: true, path: `/objects/uploads/${finalFilename}` });
    });

    writeStream.on("error", (err) => {
      req.log?.error?.({ err }, "Error writing file");
      res.status(500).json({ error: "Failed to upload file" });
    });
  } catch (error) {
    req.log?.error?.({ err: error }, "Error in local upload");
    res.status(500).json({ error: "Local upload failed" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    const response = await objectStorageService.downloadObject(file);
    if (!response) {
      res.status(404).json({ error: "Could not download file" });
      return;
    }
    const statusCode = typeof response.status === 'number' ? response.status : 200;
    res.status(statusCode);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else { res.end(); }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

// Private object serving: requires authenticated staff + path must be a known uploaded document
router.get("/storage/objects/*path", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "invigilator", "result_publisher", "doctor"), async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Enforce path format: only serve files under /objects/uploads/
    if (!objectPath.startsWith("/objects/uploads/")) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // IDOR protection
    const reqUser = (req as any).user;
    const isAdminRole = reqUser && ["super_admin", "program_admin", "central_exam_coordinator"].includes(reqUser.role);

    if (!isAdminRole) {
      if (reqUser?.role === "doctor") {
        // Doctors can only access files of candidates in their panel queue
        const doctorId = reqUser.userId;

        // 1. Get the doctor's active panel
        const panelResult = await db.execute(sql`
          SELECT ip.id as panel_id
          FROM interview_panel_members ipm
          JOIN interview_panels ip ON ip.id = ipm.panel_id
          WHERE ipm.doctor_id = ${doctorId} AND ip.is_active = TRUE
          LIMIT 1
        `);
        const panel = panelResult.rows[0] as { panel_id: number } | undefined;

        if (!panel) {
          res.status(403).json({ error: "No active panel assignment" });
          return;
        }

        // 2. Verify the file belongs to a candidate in the panel queue
        const fileFound = await db.execute(sql`
          SELECT 1
          FROM panel_queue pq
          JOIN candidates c ON c.id = pq.candidate_id
          JOIN application_submissions sub ON LOWER(sub.email) = LOWER(c.email)
          WHERE pq.panel_id = ${panel.panel_id}
            AND (
              sub.lor1_url = ${objectPath}
              OR sub.lor2_url = ${objectPath}
              OR sub.photo_url = ${objectPath}
              OR sub.payment_url = ${objectPath}
            )
          LIMIT 1
        `);

        // Also check documents table
        const docFound = fileFound.rows.length === 0 ? await db.execute(sql`
          SELECT 1
          FROM panel_queue pq
          JOIN documents d ON d.candidate_id = pq.candidate_id
          WHERE pq.panel_id = ${panel.panel_id}
            AND d.file_url = ${objectPath}
          LIMIT 1
        `) : { rows: [1] };

        if (fileFound.rows.length === 0 && docFound.rows.length === 0) {
          res.status(404).json({ error: "Object not found" });
          return;
        }
      } else {
        // Non-admin, non-doctor: check known document paths
        const found = await db.execute(sql`
          SELECT 1 FROM application_submissions
          WHERE lor1_url = ${objectPath} OR lor2_url = ${objectPath}
             OR photo_url = ${objectPath} OR payment_url = ${objectPath}
          LIMIT 1
        `);
        if (found.rows.length === 0) {
          res.status(404).json({ error: "Object not found" });
          return;
        }
      }
    }

    const isReplit = !!process.env.REPL_ID;
    if (!isReplit) {
        const { fileURLToPath } = await import("url");
        // We use process.cwd() as the base, which is consistent with the upload logic
        const localPath = path.join(process.cwd(), "uploads", objectPath.replace("/objects/uploads/", ""));
        res.sendFile(localPath, (err) => {
          if (err && !res.headersSent) {
            req.log.warn({ localPath, err }, "File not found on disk");
            res.status(404).json({ error: "File not found on disk" });
          }
        });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    if (!response) {
      res.status(404).json({ error: "Could not download object" });
      return;
    }
    const statusCode = typeof response.status === 'number' ? response.status : 200;
    res.status(statusCode);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else { res.end(); }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
