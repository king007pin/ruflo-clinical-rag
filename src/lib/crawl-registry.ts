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
// India-first new crawlers
import { idspCrawler } from "./crawlers/idsp";
import { ncgIndiaCrawler } from "./crawlers/ncg-india";
import { iapGuidelinesCrawler } from "./crawlers/iap-guidelines";
import { fogsiGuidelinesCrawler } from "./crawlers/fogsi-guidelines";
import { rssdiGuidelinesCrawler } from "./crawlers/rssdi-guidelines";
import { inaslGuidelinesCrawler } from "./crawlers/inasl-guidelines";
// Free international clinical references
import { litflCrawler } from "./crawlers/litfl";
import { radiopaediaCrawler } from "./crawlers/radiopaedia";
import { dermnetCrawler } from "./crawlers/dermnet";
import { survivingSepsisCrawler } from "./crawlers/surviving-sepsis";
import { kdigoGuidelinesCrawler } from "./crawlers/kdigo-guidelines";
import { goldCopdCrawler } from "./crawlers/gold-copd";
import { ginaAsthmaCrawler } from "./crawlers/gina-asthma";
import { statpearlsCrawler } from "./crawlers/statpearls";
import { wsesGuidelinesCrawler } from "./crawlers/wses-guidelines";
import { ntepTbCrawler } from "./crawlers/ntep-tb";
import { nacoHivCrawler } from "./crawlers/naco-hiv";
import { ncvbdcMalariaCrawler } from "./crawlers/ncvbdc-malaria";
import { uipImmunizationCrawler } from "./crawlers/uip-immunization";
import { nlem2022Crawler } from "./crawlers/nlem-2022";
import { nfiCrawler } from "./crawlers/nfi";
import { cdscoAlertsCrawler } from "./crawlers/cdsco-alerts";
import { pvpiAlertsCrawler } from "./crawlers/pvpi-alerts";
// 5 New clinical knowledge bases
import { nmcCbmeCrawler } from "./crawlers/nmc-cbme";
import { pmjayPackagesCrawler } from "./crawlers/pmjay-packages";
import { apiIndiaCrawler } from "./crawlers/api-india";
import { ipMonographsCrawler } from "./crawlers/ip-monographs";
import { whoIcd11Crawler } from "./crawlers/who-icd11";

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
  // India-first sources
  [ntepTbCrawler.id]: ntepTbCrawler,
  [nacoHivCrawler.id]: nacoHivCrawler,
  [ncvbdcMalariaCrawler.id]: ncvbdcMalariaCrawler,
  [uipImmunizationCrawler.id]: uipImmunizationCrawler,
  [nlem2022Crawler.id]: nlem2022Crawler,
  [nfiCrawler.id]: nfiCrawler,
  [cdscoAlertsCrawler.id]: cdscoAlertsCrawler,
  [pvpiAlertsCrawler.id]: pvpiAlertsCrawler,
  // India specialty bodies
  [idspCrawler.id]: idspCrawler,
  [ncgIndiaCrawler.id]: ncgIndiaCrawler,
  [iapGuidelinesCrawler.id]: iapGuidelinesCrawler,
  [fogsiGuidelinesCrawler.id]: fogsiGuidelinesCrawler,
  [rssdiGuidelinesCrawler.id]: rssdiGuidelinesCrawler,
  [inaslGuidelinesCrawler.id]: inaslGuidelinesCrawler,
  // Free international clinical references
  [litflCrawler.id]: litflCrawler,
  [radiopaediaCrawler.id]: radiopaediaCrawler,
  [dermnetCrawler.id]: dermnetCrawler,
  [survivingSepsisCrawler.id]: survivingSepsisCrawler,
  [kdigoGuidelinesCrawler.id]: kdigoGuidelinesCrawler,
  [goldCopdCrawler.id]: goldCopdCrawler,
  [ginaAsthmaCrawler.id]: ginaAsthmaCrawler,
  [statpearlsCrawler.id]: statpearlsCrawler,
  [wsesGuidelinesCrawler.id]: wsesGuidelinesCrawler,
  // 5 New clinical knowledge bases
  [nmcCbmeCrawler.id]: nmcCbmeCrawler,
  [pmjayPackagesCrawler.id]: pmjayPackagesCrawler,
  [apiIndiaCrawler.id]: apiIndiaCrawler,
  [ipMonographsCrawler.id]: ipMonographsCrawler,
  [whoIcd11Crawler.id]: whoIcd11Crawler,
};
