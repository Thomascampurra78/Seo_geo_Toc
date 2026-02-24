export interface AnalysisResult {
  url: string;
  status: 'pending' | 'success' | 'error';
  missingToC: boolean;
  deepLinkableAnchors: boolean;
  naturalLanguageHeadings: boolean;
  highInformationDensity: boolean;
  semanticHtml: boolean;
  summary: string;
  error?: string;
}

export interface ExcelRow {
  URL: string;
}
