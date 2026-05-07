export type CrawlerArticle = {
  url: string;
  title: string;
  content: string;
  description?: string;
};

export interface CrawlerDef {
  id: string;
  name: string;
  description: string;
  category: string;
  batchSize: number;
  intervalHours: number;
  delayMs: number;
  fetchUrls(): Promise<string[]>;
  fetchArticle(url: string): Promise<CrawlerArticle | null>;
}
