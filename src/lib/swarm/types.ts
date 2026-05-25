export type AgentReply = {
  model: string;
  message: string;
  reasoning: string;
  round?: 1 | 2;
};

export type MatchMeta = {
  chunk: string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  position?: number | null;
};

export type SpecialtyMeta = {
  id: string;
  role: string;
  focus: string;
  keywords: string[];
  foundations: string[];
  rulesets: string[];
};
