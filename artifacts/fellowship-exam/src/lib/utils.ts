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

