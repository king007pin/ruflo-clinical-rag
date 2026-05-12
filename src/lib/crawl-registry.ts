import type { CrawlerDef } from "./crawlers/types";
import { geneReviewsCrawler } from "./crawlers/gene-reviews";
import { merckManualCrawler } from "./crawlers/merck-manual";
import { cdcDiseasesCrawler } from "./crawlers/cdc-diseases";
import { mdcalcCrawler } from "./crawlers/mdcalc";
import { dailymedCrawler } from "./crawlers/dailymed";
import { niceGuidelinesCrawler } from "./crawlers/nice-guidelines";
import { indiaGovCrawler } from "./crawlers/india-gov";
import { orphadataCrawler } from "./crawlers/orphadata";
// New crawlers
import { wikiEmCrawler } from "./crawlers/wiki-em";
import { cochraneSummariesCrawler } from "./crawlers/cochrane-summaries";
import { ahrqReviewsCrawler } from "./crawlers/ahrq-reviews";
import { whoGuidelinesCrawler } from "./crawlers/who-guidelines";
import { whoEssentialMedsCrawler } from "./crawlers/who-essential-meds";
import { pubchemCompoundsCrawler } from "./crawlers/pubchem-compounds";
import { uspstfCrawler } from "./crawlers/uspstf";
import { omimCrawler } from "./crawlers/omim";
import { icmrGuidelinesCrawler } from "./crawlers/icmr-guidelines";
import { aiimProtocolsCrawler } from "./crawlers/aiims-protocols";
import { clinicaltrialsCrawler } from "./crawlers/clinicaltrials";
import { pubmedCentralCrawler } from "./crawlers/pubmed-central";
import { openfdaFaersCrawler } from "./crawlers/openfda-faers";
import { whoDrugSafetyCrawler } from "./crawlers/who-drug-safety";

export const CRAWLERS: Record<string, CrawlerDef> = {
  [geneReviewsCrawler.id]: geneReviewsCrawler,
  [merckManualCrawler.id]: merckManualCrawler,
  [cdcDiseasesCrawler.id]: cdcDiseasesCrawler,
  [mdcalcCrawler.id]: mdcalcCrawler,
  [dailymedCrawler.id]: dailymedCrawler,
  [niceGuidelinesCrawler.id]: niceGuidelinesCrawler,
  [indiaGovCrawler.id]: indiaGovCrawler,
  [orphadataCrawler.id]: orphadataCrawler,
  [wikiEmCrawler.id]: wikiEmCrawler,
  [cochraneSummariesCrawler.id]: cochraneSummariesCrawler,
  [ahrqReviewsCrawler.id]: ahrqReviewsCrawler,
  [whoGuidelinesCrawler.id]: whoGuidelinesCrawler,
  [whoEssentialMedsCrawler.id]: whoEssentialMedsCrawler,
  [pubchemCompoundsCrawler.id]: pubchemCompoundsCrawler,
  [uspstfCrawler.id]: uspstfCrawler,
  [omimCrawler.id]: omimCrawler,
  [icmrGuidelinesCrawler.id]: icmrGuidelinesCrawler,
  [aiimProtocolsCrawler.id]: aiimProtocolsCrawler,
  [clinicaltrialsCrawler.id]: clinicaltrialsCrawler,
  [pubmedCentralCrawler.id]: pubmedCentralCrawler,
  [openfdaFaersCrawler.id]: openfdaFaersCrawler,
  [whoDrugSafetyCrawler.id]: whoDrugSafetyCrawler,
};
