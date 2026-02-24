/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { 
  Search, 
  FileUp, 
  FileDown, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertCircle,
  Globe,
  Layout,
  Type as TypeIcon,
  Link as LinkIcon,
  Database,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { AnalysisResult, ExcelRow } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [urls, setUrls] = useState<string>('');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);
      
      const extractedUrls = jsonData
        .map(row => row.URL || Object.values(row)[0])
        .filter(url => typeof url === 'string' && url.startsWith('http'))
        .join('\n');
      
      setUrls(prev => prev ? `${prev}\n${extractedUrls}` : extractedUrls);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  const analyzeUrl = async (url: string): Promise<AnalysisResult> => {
    try {
      // 1. Fetch HTML content via proxy
      const fetchResponse = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch page content: ${fetchResponse.statusText}`);
      }

      const { html } = await fetchResponse.json();

      // 2. Analyze with Gemini
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following HTML content for SEO and GEO optimization criteria for VW PKW.
        
        HTML Content (truncated if too long):
        ${html.substring(0, 30000)}
        
        Check the following points:
        1. Missing Table of Contents (ToC): Is there a clear navigation or ToC for the page content?
        2. Deep-Linkable Anchor Tags: Are headings or sections equipped with IDs that can be linked directly?
        3. Natural Language & Question-Based Headings: Are headings formulated as questions or in natural language?
        4. High Information Density (Keywords as Entities): Does the content treat keywords as entities with rich information?
        5. Semantic HTML Structure: Does the page use proper semantic tags (h1-h6, main, section, article)?
        
        Provide a summary of findings for each point.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              missingToC: { type: Type.BOOLEAN, description: "True if ToC is missing" },
              deepLinkableAnchors: { type: Type.BOOLEAN, description: "True if sections have linkable IDs" },
              naturalLanguageHeadings: { type: Type.BOOLEAN, description: "True if headings use natural language/questions" },
              highInformationDensity: { type: Type.BOOLEAN, description: "True if content is entity-rich" },
              semanticHtml: { type: Type.BOOLEAN, description: "True if HTML structure is semantic" },
              summary: { type: Type.STRING, description: "Detailed summary of findings in Markdown" }
            },
            required: ["missingToC", "deepLinkableAnchors", "naturalLanguageHeadings", "highInformationDensity", "semanticHtml", "summary"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      
      return {
        url,
        status: 'success',
        ...data
      };
    } catch (error: any) {
      console.error(`Error analyzing ${url}:`, error);
      return {
        url,
        status: 'error',
        missingToC: false,
        deepLinkableAnchors: false,
        naturalLanguageHeadings: false,
        highInformationDensity: false,
        semanticHtml: false,
        summary: '',
        error: error.message
      };
    }
  };

  const handleAnalyze = async () => {
    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urlList.length === 0) return;

    setIsAnalyzing(true);
    setResults(urlList.map(url => ({
      url,
      status: 'pending',
      missingToC: false,
      deepLinkableAnchors: false,
      naturalLanguageHeadings: false,
      highInformationDensity: false,
      semanticHtml: false,
      summary: ''
    })));

    const newResults: AnalysisResult[] = [];
    for (const url of urlList) {
      const result = await analyzeUrl(url);
      newResults.push(result);
      setResults(prev => prev.map(r => r.url === url ? result : r));
    }

    setIsAnalyzing(false);
  };

  const exportToExcel = () => {
    const data = results.map(r => ({
      URL: r.url,
      Status: r.status,
      'Missing ToC': r.missingToC ? 'Yes' : 'No',
      'Deep-Linkable Anchors': r.deepLinkableAnchors ? 'Yes' : 'No',
      'Natural Language Headings': r.naturalLanguageHeadings ? 'Yes' : 'No',
      'High Info Density': r.highInformationDensity ? 'Yes' : 'No',
      'Semantic HTML': r.semanticHtml ? 'Yes' : 'No',
      Summary: r.summary,
      Error: r.error || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analysis Results");
    XLSX.writeFile(workbook, `VW_SEO_Analysis_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <Globe className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">VW PKW SEO/GEO Control</h1>
              <p className="text-xs text-black/50 font-medium uppercase tracking-wider">Analysis Tool v1.0</p>
            </div>
          </div>
          {results.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={() => setResults([])}
                className="flex items-center gap-2 bg-white border border-black/10 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/5 transition-colors"
              >
                Clear Results
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/80 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Export Results
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Intro Section */}
        <section className="bg-white rounded-2xl p-8 shadow-sm border border-black/5">
          <h2 className="text-2xl font-semibold mb-4">Analyze SEO & GEO Performance</h2>
          <p className="text-black/60 mb-6 leading-relaxed">
            With this tool, we can analyze the following points:
            <br />
            <span className="inline-block mt-2 font-medium text-black">• Missing ToC on relevant pages</span>
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: LinkIcon, label: "Deep-Linkable Anchors" },
              { icon: TypeIcon, label: "Natural Language Headings" },
              { icon: Database, label: "High Info Density" },
              { icon: Layout, label: "Semantic HTML Structure" }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-4 bg-[#f9f9f9] rounded-xl border border-black/5">
                <item.icon className="w-5 h-5 text-black/40" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
              <label className="block text-sm font-semibold mb-3">Enter URLs (one per line)</label>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://www.volkswagen.de/..."
                className="w-full h-48 p-4 bg-[#f9f9f9] border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all font-mono text-sm resize-none"
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !urls.trim()}
                className="w-full mt-4 bg-black text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/80 transition-all"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Start Analysis
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div 
              {...getRootProps()} 
              className={cn(
                "h-full min-h-[200px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 transition-all cursor-pointer",
                isDragActive ? "border-black bg-black/5" : "border-black/10 bg-white hover:border-black/20"
              )}
            >
              <input {...getInputProps()} />
              <FileUp className="w-10 h-10 text-black/20 mb-4" />
              <p className="text-sm font-semibold text-center">Upload Excel File</p>
              <p className="text-xs text-black/40 text-center mt-2">Drag & drop or click to select .xlsx file</p>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Analysis Results ({results.length})</h3>
                <div className="flex gap-4 text-sm font-medium">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    {results.filter(r => r.status === 'success').length} Success
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-600">
                    <XCircle className="w-4 h-4" />
                    {results.filter(r => r.status === 'error').length} Errors
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {results.map((result, idx) => (
                  <motion.div
                    key={idx}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-2xl border border-black/5 overflow-hidden shadow-sm"
                  >
                    <div className="p-6 flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "w-2 h-2 rounded-full",
                                result.status === 'pending' ? "bg-amber-400 animate-pulse" :
                                result.status === 'success' ? "bg-emerald-500" : "bg-rose-500"
                              )} />
                              <h4 className="font-semibold text-lg truncate max-w-md">{result.url}</h4>
                            </div>
                            <a 
                              href={result.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs text-black/40 hover:text-black flex items-center gap-1 transition-colors"
                            >
                              View Page <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>

                        {result.status === 'success' && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                            {[
                              { label: 'ToC Present', value: !result.missingToC },
                              { label: 'Deep Links', value: result.deepLinkableAnchors },
                              { label: 'Natural Headings', value: result.naturalLanguageHeadings },
                              { label: 'Info Density', value: result.highInformationDensity },
                              { label: 'Semantic HTML', value: result.semanticHtml }
                            ].map((check, i) => (
                              <div key={i} className="p-3 rounded-xl bg-[#f9f9f9] border border-black/5 space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">{check.label}</p>
                                <div className="flex items-center gap-2">
                                  {check.value ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-rose-500" />
                                  )}
                                  <span className="text-xs font-semibold">{check.value ? 'Pass' : 'Fail'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {result.status === 'error' && (
                          <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 flex items-center gap-3 text-rose-700">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-sm font-medium">{result.error}</p>
                          </div>
                        )}

                        {result.status === 'pending' && (
                          <div className="flex items-center gap-3 text-black/40 py-4">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <p className="text-sm font-medium">Analyzing page content...</p>
                          </div>
                        )}
                      </div>

                      {result.status === 'success' && (
                        <div className="md:w-1/3 bg-[#f9f9f9] p-6 rounded-xl border border-black/5">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-black/40 mb-3">Analysis Summary</h5>
                          <div className="prose prose-sm max-w-none text-sm text-black/70 leading-relaxed">
                            <Markdown>{result.summary}</Markdown>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/5">
        <p className="text-center text-xs text-black/30 font-medium">
          &copy; {new Date().getFullYear()} VW PKW SEO/GEO Control Elements Tool. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
