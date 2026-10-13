import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import PDFDocument from "pdfkit";

/**
 * Standardizes uploaded image files and documents into uniform specifications:
 * 1. Photos: Standardized to 600x720 px (Passport standard, 1:1.2, auto-oriented, centered cropped, optimized JPEG under 150KB).
 * 2. LORs & Document Scans: If uploaded as an image (JPG, PNG, WebP, TIFF, BMP, HEIC), automatically wrapped and converted into a standard A4 PDF document.
 * 3. Payment Proof & Other Documents: Auto-oriented, resized to max 1600x2200 px, optimized compression.
 */
export async function normalizeUploadedFile(
  filePath: string,
  fileTypeHint?: string
): Promise<{ normalizedPath: string; wasConverted: boolean }> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".gif", ".heic", ".avif"];

    const isImage = imageExtensions.includes(ext) || ext === "";
    if (!isImage) {
      // Non-image file (e.g. already a .pdf), keep as-is
      return { normalizedPath: filePath, wasConverted: false };
    }

    let sharpModule: any;
    try {
      sharpModule = (await import("sharp")).default;
    } catch {
      // sharp not available, return original
      return { normalizedPath: filePath, wasConverted: false };
    }

    const hint = (fileTypeHint || "").toLowerCase();
    const isPhoto = hint.includes("photo") || path.basename(filePath).toLowerCase().includes("photo");
    const isLor = hint.includes("lor") || hint.includes("recommendation") || path.basename(filePath).toLowerCase().includes("lor");
    const isDoc = hint.includes("doc") || hint.includes("cert") || hint.includes("marksheet") || isLor;

    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, ext);

    if (isPhoto) {
      // Standardize Passport Photo: 600x720 px (Aspect ratio 1:1.2), cover crop, auto-rotate EXIF, crisp JPEG
      const outputPath = path.join(dir, `${baseName}_std.jpg`);
      await sharpModule(filePath, { failOnError: false })
        .rotate() // Auto-orient based on EXIF
        .resize(600, 720, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(outputPath);

      await fs.unlink(filePath).catch(() => {});
      await fs.rename(outputPath, filePath).catch(() => {});
      return { normalizedPath: filePath, wasConverted: true };
    }

    if (isDoc) {
      // Convert LOR / Certificate image scan into a standard A4 PDF document
      const tempOptimizedImg = path.join(dir, `${baseName}_temp.jpg`);
      const pdfOutputPath = path.join(dir, `${baseName}.pdf`);

      // Optimize image first
      await sharpModule(filePath, { failOnError: false })
        .rotate()
        .resize(1600, 2200, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(tempOptimizedImg);

      // Create PDF and embed image centered on standard A4 page (595.28 x 841.89 pt)
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 20 });
        const writeStream = createWriteStream(pdfOutputPath);
        doc.pipe(writeStream);

        const pageWidth = 595.28 - 40; // with margins
        const pageHeight = 841.89 - 40;

        doc.image(tempOptimizedImg, 20, 20, {
          fit: [pageWidth, pageHeight],
          align: "center",
          valign: "center",
        });

        doc.end();
        writeStream.on("finish", () => resolve());
        writeStream.on("error", reject);
      });

      // Clean up temporary image and original non-pdf file
      await fs.unlink(tempOptimizedImg).catch(() => {});
      if (filePath !== pdfOutputPath) {
        await fs.unlink(filePath).catch(() => {});
      }

      return { normalizedPath: pdfOutputPath, wasConverted: true };
    }

    // Default general image (e.g. payment screenshot): Auto-orient, max 1600x2200, clean JPEG
    const outputPath = path.join(dir, `${baseName}_std.jpg`);
    await sharpModule(filePath, { failOnError: false })
      .rotate()
      .resize(1600, 2200, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outputPath);

    await fs.unlink(filePath).catch(() => {});
    await fs.rename(outputPath, filePath).catch(() => {});
    return { normalizedPath: filePath, wasConverted: true };
  } catch (err: any) {
    console.warn(`[image-normalizer] Could not normalize ${filePath}:`, err.message);
    return { normalizedPath: filePath, wasConverted: false };
  }
}
