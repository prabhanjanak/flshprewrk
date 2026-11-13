import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

import { db, applicationSubmissionsTable, applicationFormsTable, programsTable, candidatesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "./middleware/auth";
import { attachMockMode } from "./middleware/mock";
import { generateApplicationPdfBuffer } from "./lib/application-pdf";

import { bootstrapDatabase } from "./lib/db-bootstrap";

const app: Express = express();

let vercelBootstrapped = false;
let vercelBootstrapPromise: Promise<void> | null = null;

if (process.env.VERCEL) {
  app.use(async (req, res, next) => {
    if (!vercelBootstrapped) {
      if (!vercelBootstrapPromise) {
        vercelBootstrapPromise = bootstrapDatabase()
          .then(() => {
            vercelBootstrapped = true;
          })
          .catch((err) => {
            console.error("[Vercel Serverless Bootstrap Error]:", err);
            vercelBootstrapPromise = null;
          });
      }
      await vercelBootstrapPromise;
    }
    next();
  });
}

app.use(attachMockMode);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", router);

// Explicit root health checks for Docker/Load Balancers
app.get(["/healthz", "/ping"], (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// GUARANTEED PRINT ROUTE (Directly on app to avoid router conflicts)
app.get(
  ["/api/v2/generate-print/:id", "/v2/generate-print/:id"],
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator", "doctor"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.id, id));
      if (!sub) return res.status(404).json({ error: "Submission not found" });

      const [form] = await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.id, sub.formId));
      const [program] = form ? await db.select().from(programsTable).where(eq(programsTable.id, form.programId)) : [null];

      let candidate = null;
      if (sub.email) {
        const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.email, sub.email));
        candidate = c || null;
      }

      const pdfBuffer = await generateApplicationPdfBuffer({ sub, form, program, candidate });
      const filename = `Application_${(sub.fullName || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_")}_${id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' blob: data:; img-src 'self' data: blob:;");
      res.send(pdfBuffer);
    } catch (e: any) {
      console.error("[print-gen] error:", e);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

app.use(["/objects", "/api/objects"], async (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  const fullPath = (req.baseUrl || "") + (req.url || "");
  const cleanPath = fullPath.replace(/^\/api/, "").split("?")[0];

  const candidatePaths = [
    path.join(process.cwd(), "uploads", cleanPath.replace("/objects/uploads/", "")),
    path.join(os.tmpdir(), "uploads", cleanPath.replace("/objects/uploads/", "")),
    path.join(process.cwd(), "uploads", cleanPath.replace("/objects/", "")),
    path.join(os.tmpdir(), "uploads", cleanPath.replace("/objects/", "")),
  ];
  for (const cp of candidatePaths) {
    try {
      if (fs.existsSync(cp) && fs.statSync(cp).isFile()) {
        return res.sendFile(cp);
      }
    } catch (_) {}
  }

  try {
    const normalizedPath = "/objects/uploads/" + cleanPath.replace(/^\/objects\/(uploads\/)?/, "");
    const result = await db.execute(sql`
      SELECT file_name, content_type, file_data, file_size 
      FROM uploaded_files 
      WHERE file_path = ${cleanPath} OR file_path = ${normalizedPath}
      LIMIT 1
    `);
    if (result.rows.length > 0) {
      const row = result.rows[0] as any;
      res.setHeader("Content-Type", row.content_type || "application/octet-stream");
      res.setHeader("Content-Length", row.file_size);
      res.setHeader("Content-Disposition", `inline; filename="${row.file_name}"`);
      return res.end(row.file_data);
    }
  } catch (e) {
    console.error("[objects serving error]:", e);
  }
  next();
});

app.use("/objects", express.static(path.join(process.cwd(), "uploads")));

const candidateDistPaths = [
  path.join(fileURLToPath(new URL(".", import.meta.url)), "../../fellowship-exam/dist"),
  path.join(fileURLToPath(new URL(".", import.meta.url)), "../artifacts/fellowship-exam/dist"),
  path.join(fileURLToPath(new URL(".", import.meta.url)), "../public"),
  path.join(process.cwd(), "artifacts/fellowship-exam/dist"),
  path.join(process.cwd(), "public"),
  path.join(process.cwd(), "dist/public"),
];

const examDist = candidateDistPaths.find((p) => fs.existsSync(p));

if (examDist) {
  // Serve static files from the build directory
  app.use(express.static(examDist));

  // Handle SPA routing: any non-API route serves index.html
  app.use((req, res, next) => {
    // Skip API and static objects
    if (req.path.startsWith("/api") || req.path.startsWith("/objects")) {
      return next();
    }
    res.sendFile(path.join(examDist, "index.html"));
  });
}

// Centralized Express error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, "Express request error");
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = typeof err.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = statusCode === 500 && process.env.NODE_ENV === "production"
    ? "An internal server error occurred"
    : err.message || "Internal server error";

  res.status(statusCode).json({ error: message });
});

export default app;

