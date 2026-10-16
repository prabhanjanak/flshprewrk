import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth, requireRole } from "../middleware/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import path from "path";
import os from "os";
import fs from "fs";

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

router.put("/storage/local-upload/:filename", requireAuth, async (req: Request, res: Response) => {
  try {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    req.on("end", async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const filename = req.params.filename as string;
        const objectPath = `/objects/uploads/${filename}`;
        const contentType = (req.headers["content-type"] as string) || "application/octet-stream";

        // 1. Write to /tmp disk cache (safe and writable on Vercel)
        try {
          const tmpUploadDir = path.join(os.tmpdir(), "uploads");
          await fs.promises.mkdir(tmpUploadDir, { recursive: true });
          await fs.promises.writeFile(path.join(tmpUploadDir, filename), buffer);
        } catch (_) {}

        // 2. Try writing to process.cwd() (works locally on dev)
        try {
          const localUploadDir = path.join(process.cwd(), "uploads");
          await fs.promises.mkdir(localUploadDir, { recursive: true });
          await fs.promises.writeFile(path.join(localUploadDir, filename), buffer);
        } catch (_) {}

        // 3. Persist permanently to Neon Postgres DB
        await db.execute(sql`
          INSERT INTO uploaded_files (file_path, file_name, content_type, file_data, file_size)
          VALUES (${objectPath}, ${filename}, ${contentType}, ${buffer}, ${buffer.length})
          ON CONFLICT (file_path) DO UPDATE SET
            file_data = EXCLUDED.file_data,
            file_size = EXCLUDED.file_size,
            content_type = EXCLUDED.content_type,
            created_at = NOW()
        `);

        res.json({ success: true, path: objectPath });
      } catch (saveErr: any) {
        req.log?.error?.({ err: saveErr }, "Error saving uploaded file");
        res.status(500).json({ error: saveErr.message || "Failed to save file" });
      }
    });

    req.on("error", (err) => {
      req.log?.error?.({ err }, "Upload stream error");
      if (!res.headersSent) res.status(500).json({ error: "Upload stream failed" });
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
      // 1. Check disk paths (/tmp or uploads/)
      const candidatePaths = [
        path.join(process.cwd(), "uploads", objectPath.replace("/objects/uploads/", "")),
        path.join(os.tmpdir(), "uploads", objectPath.replace("/objects/uploads/", "")),
        path.join(process.cwd(), "uploads", objectPath.replace("/objects/", "")),
        path.join(os.tmpdir(), "uploads", objectPath.replace("/objects/", "")),
      ];
      for (const cp of candidatePaths) {
        if (fs.existsSync(cp)) {
          return res.sendFile(cp);
        }
      }

      // 2. Fetch from Neon Postgres uploaded_files table
      try {
        const result = await db.execute(sql`
          SELECT file_name, content_type, file_data, file_size 
          FROM uploaded_files 
          WHERE file_path = ${objectPath} OR file_path = ${'/objects/uploads/' + objectPath.replace(/^\/objects\/(uploads\/)?/, '')}
          LIMIT 1
        `);
        if (result.rows.length > 0) {
          const row = result.rows[0] as any;
          res.setHeader("Content-Type", row.content_type || "application/octet-stream");
          res.setHeader("Content-Length", row.file_size);
          res.setHeader("Content-Disposition", `inline; filename="${row.file_name}"`);
          return res.end(row.file_data);
        }
      } catch (dbErr) {
        req.log?.warn?.({ err: dbErr }, "Database file lookup failed");
      }

      return res.status(404).json({ error: "File not found" });
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
