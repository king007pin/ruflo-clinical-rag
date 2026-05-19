/**
 * Safe HTML stripper — loop-based removal prevents multi-character sanitization bypass.
 * Handles nested/obfuscated <script> and <style> blocks before stripping all remaining tags.
 */
export function stripHtml(html: string): string {
  let s = html;
  let prev: string;
  do { prev = s; s = s.replace(/<script\b[\s\S]*?<\/script>/gi, ""); } while (prev !== s);
  do { prev = s; s = s.replace(/<style\b[\s\S]*?<\/style>/gi, ""); } while (prev !== s);
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}
