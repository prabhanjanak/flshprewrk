import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extracts the `/objects/...` path from a URL (relative or absolute).
 * Returns null if the URL is an external link not matching the secure storage path pattern.
 */
export function getCleanObjectPath(url: string | null): string | null {
  if (!url) return null;
  const index = url.indexOf("/objects/");
  if (index !== -1) {
    return url.substring(index);
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return null; // External/non-object URL
  }
  return url.startsWith("/") ? `/objects${url}` : `/objects/${url}`;
}

export interface ParsedSurgery {
  procedure: string;
  independent: number;
  supervision: number;
  total: number;
}

export function parseSurgicalExperience(raw: any): ParsedSurgery[] {
  if (!raw) return [];
  const results: ParsedSurgery[] = [];

  if (typeof raw === "object" && raw !== null) {
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === "object" && val !== null) {
        const ind = Number((val as any).independent ?? (val as any).ind ?? 0);
        const sup = Number((val as any).supervision ?? (val as any).sup ?? 0);
        results.push({ procedure: key.toUpperCase(), independent: ind, supervision: sup, total: ind + sup });
      } else if (typeof val === "number" || typeof val === "string") {
        const num = Number(val) || 0;
        results.push({ procedure: key.toUpperCase(), independent: num, supervision: 0, total: num });
      }
    }
    return results;
  }

  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === "object" && parsed !== null) {
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === "object" && val !== null) {
          const ind = Number((val as any).independent ?? (val as any).ind ?? 0);
          const sup = Number((val as any).supervision ?? (val as any).sup ?? 0);
          results.push({ procedure: key.toUpperCase(), independent: ind, supervision: sup, total: ind + sup });
        }
      }
      if (results.length > 0) return results;
    }
  } catch { }

  const regex = /([A-Za-z0-9\s/+-]+):\s*\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const proc = match[1].trim().toUpperCase();
    const inner = match[2];
    const indMatch = inner.match(/independent\s*:\s*(\d+)/i) || inner.match(/ind\s*:\s*(\d+)/i);
    const supMatch = inner.match(/supervision\s*:\s*(\d+)/i) || inner.match(/sup\s*:\s*(\d+)/i);
    const ind = indMatch ? Number(indMatch[1]) : 0;
    const sup = supMatch ? Number(supMatch[1]) : 0;
    results.push({ procedure: proc, independent: ind, supervision: sup, total: ind + sup });
  }
  if (results.length > 0) return results;

  const parts = str.split(",").map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    const [k, v] = p.split(":").map(s => s.trim());
    if (k && v) {
      const num = Number(v) || 0;
      results.push({ procedure: k.toUpperCase(), independent: num, supervision: 0, total: num });
    }
  }
  return results;
}

export interface ParsedSkill {
  name: string;
  level: "Expert" | "Proficient" | "Intermittent" | "Beginner";
}

export function parseDiagnosticSkills(raw: any): ParsedSkill[] {
  if (!raw) return [];
  const results: ParsedSkill[] = [];

  if (typeof raw === "object" && raw !== null) {
    for (const [k, v] of Object.entries(raw)) {
      const valStr = String(v);
      let level: ParsedSkill["level"] = "Proficient";
      if (/expert/i.test(valStr)) level = "Expert";
      else if (/intermittent/i.test(valStr)) level = "Intermittent";
      else if (/beginner|basic/i.test(valStr)) level = "Beginner";
      results.push({ name: k, level });
    }
    return results;
  }

  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === "object" && parsed !== null) {
      for (const [k, v] of Object.entries(parsed)) {
        const valStr = String(v);
        let level: ParsedSkill["level"] = "Proficient";
        if (/expert/i.test(valStr)) level = "Expert";
        else if (/intermittent/i.test(valStr)) level = "Intermittent";
        else if (/beginner|basic/i.test(valStr)) level = "Beginner";
        results.push({ name: k, level });
      }
      if (results.length > 0) return results;
    }
  } catch { }

  const items = str.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  for (const item of items) {
    const colonIdx = item.lastIndexOf(":");
    if (colonIdx !== -1) {
      const name = item.slice(0, colonIdx).trim();
      const valStr = item.slice(colonIdx + 1).trim();
      let level: ParsedSkill["level"] = "Proficient";
      if (/expert/i.test(valStr)) level = "Expert";
      else if (/intermittent/i.test(valStr)) level = "Intermittent";
      else if (/beginner|basic/i.test(valStr)) level = "Beginner";
      if (name) results.push({ name, level });
    } else {
      results.push({ name: item, level: "Proficient" });
    }
  }
  return results;
}

