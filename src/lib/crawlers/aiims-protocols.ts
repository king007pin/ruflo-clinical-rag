import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";
import { textFromPdfBuffer } from "@/lib/pdf";

const AIIMS_BASE = "https://www.aiims.edu";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

async function parsePdfBuffer(arrayBuffer: ArrayBuffer | Buffer): Promise<string> {
  return textFromPdfBuffer(arrayBuffer).catch(() => "");
}

function sanitizeTextForPostgres(text: string): string {
  // PostgreSQL does not support null bytes (\u0000) in text columns
  return text.replace(/\u0000/g, "");
}

export const aiimProtocolsCrawler: CrawlerDef = {
  id: "aiims-protocols",
  name: "AIIMS Clinical Protocols",
  description: "AIIMS — All India Institute of Medical Sciences treatment protocols and clinical practice guidelines",
  category: "India Guidelines",
  batchSize: 8,
  intervalHours: 336,
  delayMs: 800,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    const seedPages = [
      `${AIIMS_BASE}/index.php/research-publications`,
      `${AIIMS_BASE}/index.php/research-publications/departmental-publications`,
      `${AIIMS_BASE}/index.php/patients-community/clinical-guidelines`,
    ];

    for (const seedUrl of seedPages) {
      try {
        await new Promise((r) => setTimeout(r, 800));
        const res = await fetch(seedUrl, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) continue;
        const html = await res.text();

        for (const match of html.matchAll(/href="((?:https?:\/\/www\.aiims\.edu)?\/[^"#?]+)"/gi)) {
          const raw = match[1];
          const path = raw.startsWith("http") ? raw : `${AIIMS_BASE}${raw}`;
          if (!seen.has(path) && !path.endsWith(".jpg") && !path.endsWith(".png")) {
            seen.add(path);
            urls.push(path);
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback: AIIMS department pages that are known to have clinical content
    const deptPages = [
      `${AIIMS_BASE}/index.php/academic-departments/medicine`,
      `${AIIMS_BASE}/index.php/academic-departments/surgery`,
      `${AIIMS_BASE}/index.php/academic-departments/paediatrics`,
      `${AIIMS_BASE}/index.php/academic-departments/cardiology`,
      `${AIIMS_BASE}/index.php/academic-departments/neurology`,
      `${AIIMS_BASE}/index.php/academic-departments/oncology`,
    ];

    for (const u of deptPages) {
      if (!seen.has(u)) { seen.add(u); urls.push(u); }
    }

    return urls.slice(0, 300);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 800));

      const isDirectPdf = url.toLowerCase().endsWith(".pdf");

      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;

      const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
      const isPdfResponse = contentType.includes("application/pdf") || isDirectPdf;

      if (isPdfResponse) {
        const arrayBuffer = await res.arrayBuffer();
        const rawContent = await parsePdfBuffer(arrayBuffer);
        const content = sanitizeTextForPostgres(rawContent);
        if (content.length < 150) return null;

        // Derive clean title from filename or URL
        const filename = decodeURIComponent(url.split("/").pop() ?? "")
          .replace(/\.pdf$/i, "")
          .replace(/[-_]/g, " ")
          .trim();
        const title = sanitizeTextForPostgres(filename || "AIIMS Clinical Protocol PDF");

        return {
          url,
          title,
          content: content.slice(0, 10_000),
          description: "AIIMS — All India Institute of Medical Sciences clinical protocol PDF",
        };
      }

      // Handle as HTML
      const html = await res.text();
      
      // Secondary check: Did we get a mislabeled PDF (e.g. starts with %PDF)?
      if (html.startsWith("%PDF-")) {
        // Convert the string representation of PDF to Buffer and parse it
        const buffer = Buffer.from(html, "binary");
        const rawContent = await parsePdfBuffer(buffer);
        const content = sanitizeTextForPostgres(rawContent);
        if (content.length < 150) return null;

        const filename = decodeURIComponent(url.split("/").pop() ?? "")
          .replace(/\.pdf$/i, "")
          .replace(/[-_]/g, " ")
          .trim();
        const title = sanitizeTextForPostgres(filename || "AIIMS Clinical Protocol PDF");

        return {
          url,
          title,
          content: content.slice(0, 10_000),
          description: "AIIMS — All India Institute of Medical Sciences clinical protocol PDF",
        };
      }

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
      const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const title = sanitizeTextForPostgres(
        stripHtml(h1 || titleTag).split("|")[0].trim() || "AIIMS Clinical Content"
      );

      const mainContent =
        html.match(/<div[^>]+class="[^"]*item-page[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = sanitizeTextForPostgres(stripHtml(mainContent));
      if (content.length < 150) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "AIIMS — All India Institute of Medical Sciences clinical protocol",
      };
    } catch {
      return null;
    }
  },
};
