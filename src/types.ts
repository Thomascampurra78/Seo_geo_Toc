export interface AnalysisResult {
  url: string;
  status: 'pending' | 'success' | 'error';
  tocExists: boolean;
  placementRespected: boolean;
  htmlTagsRespected: boolean;
  keywordsRespected: boolean;
  nestingRespected: boolean;
  suggestions: string;
  summary: string;
  error?: string;
}

export interface ExcelRow {
  URL: string;
}
