export type FeedItem = {
  title: string;
  url: string;
  content: string;
  pubDate?: string;
};

function extractTag(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(
      `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
      "i",
    );
    const m = xml.match(re);
    if (m?.[1]) return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function extractHref(xml: string): string {
  const m = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  return m?.[1] ?? "";
}

function extractUrl(block: string): string {
  const text = extractTag(block, "link");
  if (text.startsWith("http")) return text;
  const href = extractHref(block);
  if (href) return href;
  const guid = extractTag(block, "guid", "id");
  if (guid.startsWith("http")) return guid;
  return "";
}

export async function fetchRssFeed(url: string, maxItems = 15): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MediqRAG/1.0 (clinical research copilot)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`RSS fetch failed (${res.status}): ${url}`);
  const xml = await res.text();

  const items: FeedItem[] = [];
  const re = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && items.length < maxItems) {
    const block = m[1];
    const title = extractTag(block, "title");
    const itemUrl = extractUrl(block);
    const content = extractTag(block, "description", "summary", "content:encoded", "content");
    const pubDate = extractTag(block, "pubDate", "published", "updated", "dc:date");
    const body = content || title;
    if (body) items.push({ title: title || "Untitled", url: itemUrl, content: body, pubDate });
  }
  return items;
}

export async function fetchPubmedAbstracts(query: string, maxResults = 10): Promise<FeedItem[]> {
  const key = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : "";

  const searchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&sort=pub+date&retmax=${maxResults}&retmode=json${key}`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!searchRes.ok) throw new Error(`PubMed search failed (${searchRes.status})`);
  const searchData = (await searchRes.json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const ids = searchData.esearchresult?.idlist ?? [];
  if (!ids.length) return [];

  // Respect NCBI rate limit (3 req/s without key, 10 with)
  await new Promise((r) => setTimeout(r, process.env.NCBI_API_KEY ? 110 : 400));

  const fetchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=text${key}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!fetchRes.ok) throw new Error(`PubMed fetch failed (${fetchRes.status})`);
  const text = await fetchRes.text();

  const blocks = text.split(/\n\n\d+\.\s+/).filter((b) => b.trim().length > 40);
  return blocks.slice(0, maxResults).map((block, idx) => {
    const firstLine = block.split("\n")[0] ?? "";
    return {
      title: `PubMed abstract: ${firstLine.slice(0, 100)}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${ids[idx] ?? ""}`,
      content: block.slice(0, 3000).trim(),
      pubDate: new Date().toISOString(),
    };
  });
}
