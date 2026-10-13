import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "./lib/objectStorage";
import { requireAuth, requireRole } from "./middleware/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import path from "path";
import PDFDocument from "pdfkit";
import fs from "fs/promises";
import { createWriteStream } from "fs";

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
      // Local fallback for production outside Replit
      const objectId = Math.random().toString(36).substring(2, 10);
      const ext = name.split('.').pop() ?? "bin";
      const sanitizedName = name.split('.')[0].replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `${sanitizedName}_${objectId}.${ext}`;
      const folderName = "Admin_Uploads";

      const uploadURL = `/api/storage/uploads/local-upload/${folderName}/${filename}`;
      const objectPath = `/objects/uploads/${folderName}/${filename}`;
      res.json({ uploadURL, objectPath, metadata: { name: name.trim(), size, contentType } });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name: name.trim(), size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.put("/storage/uploads/local-upload/:folderName/:filename", requireAuth, async (req: Request, res: Response) => {
  try {
    const folderName = String(req.params.folderName);
    const filename = String(req.params.filename);

    const uploadDir = path.join(process.cwd(), "uploads", folderName);
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    const writeStream = createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on("finish", () => {
      res.json({ success: true, path: `/objects/uploads/${folderName}/${filename}` });
    });

    writeStream.on("error", (err) => {
      req.log.error({ err }, "Write stream error");
      if (!res.headersSent) res.status(500).json({ error: "File write failed" });
    });

    req.on("error", (err) => {
      req.log.error({ err }, "Request stream error");
      if (!res.headersSent) res.status(500).json({ error: "Upload stream failed" });
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to process upload");
    if (!res.headersSent) res.status(500).json({ error: "Failed to process upload" });
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
    const statusCode = typeof response.status === "number" ? response.status : 200;
    res.status(statusCode);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else { res.end(); }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

// Private object serving: requires authenticated staff + path must be a known uploaded document
router.get("/storage/objects/*path", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "invigilator", "result_publisher"), async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Enforce path format: only serve files under /objects/uploads/
    if (!objectPath.startsWith("/objects/uploads/")) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // IDOR protection: verify this path is a known document in application_submissions
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

    // Dynamic Image-to-PDF conversion for LOR files (PNG/JPG/JPEG -> PDF)
    const isLorResult = await db.execute(sql`
      SELECT 1 FROM application_submissions
      WHERE lor1_url = ${objectPath} OR lor2_url = ${objectPath}
      LIMIT 1
    `);
    const isLor = isLorResult.rows.length > 0;
    const isImage = /\.(png|jpg|jpeg)$/i.test(wildcardPath);

    if (isLor && isImage) {
      const localPath = path.join(process.cwd(), "uploads", objectPath.replace("/objects/uploads/", ""));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="LOR_${path.basename(wildcardPath)}.pdf"`);
      try {
        const doc = new PDFDocument({ margin: 0, size: "A4" });
        doc.pipe(res);
        // A4 points: 595.28 x 841.89
        doc.image(localPath, 0, 0, {
          fit: [595.28, 841.89],
          align: "center",
          valign: "center"
        });
        doc.end();
        return;
      } catch (err) {
        req.log.error({ err }, "Image-to-PDF conversion failed, falling back to standard serve");
      }
    }

    const isReplit = !!process.env.REPL_ID;
    if (!isReplit) {
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
    const statusCode = typeof response.status === "number" ? response.status : 200;
    res.status(statusCode);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
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
