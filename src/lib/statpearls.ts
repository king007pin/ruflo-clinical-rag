const NCBI_BASE = "https://www.ncbi.nlm.nih.gov";
const STATPEARLS_TOC = "https://www.ncbi.nlm.nih.gov/books/NBK430685/";
const NCBI_DELAY_MS = 500; // NCBI rate-limit: be polite

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
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

function extractTag(html: string, tag: string, attr?: string): string {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*${attr}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    return html.match(re)?.[1] ?? "";
  }
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return html.match(re)?.[1] ?? "";
}

export type StatpearlsArticle = {
  url: string;
  title: string;
  content: string;
};

export async function fetchStatpearlsArticleUrls(): Promise<string[]> {
  const res = await fetch(STATPEARLS_TOC, {
    headers: {
      "User-Agent": "RufloRAG/1.0 (clinical research; NCBI Bookshelf; contact: admin@ruflo.ai)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`StatPearls TOC fetch failed (${res.status})`);
  const html = await res.text();

  // Extract all /books/NBK{ID}/ links — each is one StatPearls article
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const match of html.matchAll(/href="(\/books\/NBK(\d+)\/?(?:#[^"]+)?)"/g)) {
    const path = match[1].split("#")[0]; // strip anchors
    const nbkId = match[2];
    // Skip the main TOC page itself (NBK430685)
    if (nbkId === "430685") continue;
    const full = `${NCBI_BASE}${path}`;
    if (!seen.has(full)) {
      seen.add(full);
      urls.push(full);
    }
  }
  return urls;
}

export async function fetchStatpearlsArticle(url: string): Promise<StatpearlsArticle | null> {
  try {
    await new Promise((r) => setTimeout(r, NCBI_DELAY_MS));
    const res = await fetch(url, {
      headers: {
        "User-Agent": "RufloRAG/1.0 (clinical research; NCBI Bookshelf)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Title from h1 or <title>
    const h1 = extractTag(html, "h1");
    const titleTag = extractTag(html, "title");
    const title = stripHtml(h1 || titleTag).split(" - ")[0].trim() || url;

    // Main article content from NCBI bookshelf structure
    const mainContent =
      html.match(/<div[^>]+id="maincontent"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1] ??
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
      html.match(/<div[^>]+class="[^"]*book-toc[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
      html;

    const content = stripHtml(mainContent);
    if (content.length < 150) return null;

    // Cap at 12 000 chars — enough for a full StatPearls article
    return { url, title, content: content.slice(0, 12_000) };
  } catch {
    return null;
  }
}

export type CrawlBatchResult = {
  ingested: number;
  skipped: number;
  errors: number;
  nextOffset: number;
  done: boolean;
  totalUrls: number;
};
