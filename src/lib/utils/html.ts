/**
 * Extracts plain text from HTML for RAG indexing.
 * Input is from trusted medical sources only — not used as a security sanitizer.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
