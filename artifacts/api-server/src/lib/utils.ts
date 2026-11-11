/**
 * Robust specialization parser to handle PostgreSQL array string representation (e.g. '{"Cornea","Phaco Refractive"}'),
 * JSON arrays (e.g. '["Cornea", "Phaco Refractive"]'), and standard comma-separated lists.
 */
export function parseSpecializationString(spec: string | null | undefined): string[] {
  if (!spec) return [];
  let s = spec.trim();
  if (!s) return [];

  // Handle PostgreSQL curly-brace array format: {"Cornea", "Phaco Refractive"}
  if (s.startsWith("{") && s.endsWith("}")) {
    s = s.substring(1, s.length - 1);
    const list: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        list.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim() || list.length > 0) {
      list.push(current.trim());
    }
    return list.map(item => {
      let cleaned = item;
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      return cleaned.trim();
    }).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* not JSON */ }
  
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/**
 * Robust Date of Birth standardizer to format incoming flexible date expressions as DD/MM/YYYY.
 */
export function formatDOBToStandard(dob: string | null | undefined): string {
  if (!dob) return "N/A";
  const s = String(dob).trim();
  if (!s || s.toLowerCase() === "n/a" || s === "0") return "N/A";

  const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T.*)?$/;
  const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;

  let match = s.match(ymdRegex);
  if (match) {
    const [_, year, month, day] = match;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  }

  match = s.match(dmyRegex);
  if (match) {
    const [_, day, month, year] = match;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  }

  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {
    // ignore
  }

  return s;
}

export function formatToDDMMYYYY(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const year = ist.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export function formatTo12HrTime(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  let hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

export function formatToLocalDateTime(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const year = ist.getUTCFullYear();
  let hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day}-${month}-${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
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

