import type { CrawlerDef } from "./crawlers/types";
import { geneReviewsCrawler } from "./crawlers/gene-reviews";
import { merckManualCrawler } from "./crawlers/merck-manual";
import { cdcDiseasesCrawler } from "./crawlers/cdc-diseases";
import { mdcalcCrawler } from "./crawlers/mdcalc";
import { dailymedCrawler } from "./crawlers/dailymed";
import { niceGuidelinesCrawler } from "./crawlers/nice-guidelines";
import { indiaGovCrawler } from "./crawlers/india-gov";
import { orphadataCrawler } from "./crawlers/orphadata";

export const CRAWLERS: Record<string, CrawlerDef> = {
  [geneReviewsCrawler.id]: geneReviewsCrawler,
  [merckManualCrawler.id]: merckManualCrawler,
  [cdcDiseasesCrawler.id]: cdcDiseasesCrawler,
  [mdcalcCrawler.id]: mdcalcCrawler,
  [dailymedCrawler.id]: dailymedCrawler,
  [niceGuidelinesCrawler.id]: niceGuidelinesCrawler,
  [indiaGovCrawler.id]: indiaGovCrawler,
  [orphadataCrawler.id]: orphadataCrawler,
};
