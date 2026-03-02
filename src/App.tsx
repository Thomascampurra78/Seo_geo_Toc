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
  ExternalLink,
  ListOrdered,
  MapPin,
  Code2,
  Tags,
  Layers,
  Lightbulb
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
      const fetchResponse = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch page content: ${fetchResponse.statusText}`);
      }

      const { html } = await fetchResponse.json();

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following HTML content for the presence and quality of a Table of Contents (ToC) for VW PKW.
        
        HTML Content (truncated if too long):
        ${html.substring(0, 30000)}
        
        Check the following points for the Table of Contents:
        1. Placement: Is it above the fold, after the intro? (Keeps users on page; defines the topic immediately).
        2. HTML Tags: Does it use <ul> and <li> with anchor links? (Standardized code is easier for crawlers to parse).
        3. Keywords: Does it use descriptive, keyword-rich headings? (Tells SEO/AI exactly what each section covers).
        4. Nesting: Does it use H2 and H3 hierarchy? (Shows the relationship between sub-topics).
        
        Provide a summary of findings and specific suggestions for improvement.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tocExists: { type: Type.BOOLEAN, description: "True if a Table of Contents exists" },
              placementRespected: { type: Type.BOOLEAN, description: "True if placement is above the fold/after intro" },
              htmlTagsRespected: { type: Type.BOOLEAN, description: "True if <ul>/<li> with anchor links are used" },
              keywordsRespected: { type: Type.BOOLEAN, description: "True if descriptive, keyword-rich headings are used" },
              nestingRespected: { type: Type.BOOLEAN, description: "True if H2 and H3 hierarchy is used" },
              suggestions: { type: Type.STRING, description: "Specific suggestions for improvement" },
              summary: { type: Type.STRING, description: "General summary of the ToC analysis" }
            },
            required: ["tocExists", "placementRespected", "htmlTagsRespected", "keywordsRespected", "nestingRespected", "suggestions", "summary"]
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
        tocExists: false,
        placementRespected: false,
        htmlTagsRespected: false,
        keywordsRespected: false,
        nestingRespected: false,
        suggestions: '',
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
      tocExists: false,
      placementRespected: false,
      htmlTagsRespected: false,
      keywordsRespected: false,
      nestingRespected: false,
      suggestions: '',
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
      'ToC Exists': r.tocExists ? 'Yes' : 'No',
      'Placement Respected': r.tocExists ? (r.placementRespected ? 'Yes' : 'No') : 'N/A',
      'HTML Tags Respected': r.tocExists ? (r.htmlTagsRespected ? 'Yes' : 'No') : 'N/A',
      'Keywords Respected': r.tocExists ? (r.keywordsRespected ? 'Yes' : 'No') : 'N/A',
      'Nesting Respected': r.tocExists ? (r.nestingRespected ? 'Yes' : 'No') : 'N/A',
      Suggestions: r.suggestions,
      Summary: r.summary,
      Error: r.error || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ToC Analysis Results");
    XLSX.writeFile(workbook, `VW_ToC_Analysis_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <ListOrdered className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">VW SEO/GEO ToC Control</h1>
              <p className="text-xs text-black/50 font-medium uppercase tracking-wider">Missing ToC Analysis v2.0</p>
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
          <h2 className="text-2xl font-semibold mb-4">Table of Contents Analysis</h2>
          <p className="text-black/60 mb-6 leading-relaxed">
            Analyze the presence and quality of Table of Contents (ToC) elements based on the following rules:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: MapPin, label: "Placement", desc: "Above the fold, after the intro", why: "Keeps users on page; defines topic immediately" },
              { icon: Code2, label: "HTML Tags", desc: "Use <ul> and <li> with anchor links", why: "Standardized code is easier for crawlers" },
              { icon: Tags, label: "Keywords", desc: "Descriptive, keyword-rich headings", why: "Tells SEO/AI exactly what section covers" },
              { icon: Layers, label: "Nesting", desc: "Use H2 and H3 hierarchy", why: "Shows relationship between sub-topics" }
            ].map((item, i) => (
              <div key={i} className="flex flex-col gap-2 p-4 bg-[#f9f9f9] rounded-xl border border-black/5">
                <div className="flex items-center gap-2">
                  <item.icon className="w-4 h-4 text-black/40" />
                  <span className="text-sm font-bold">{item.label}</span>
                </div>
                <p className="text-xs font-medium text-black/80">{item.desc}</p>
                <p className="text-[10px] text-black/40 italic">Why: {item.why}</p>
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
                          <div className="space-y-4">
                            <div className="flex items-center gap-4 p-3 bg-[#f9f9f9] rounded-xl border border-black/5">
                              <p className="text-xs font-bold uppercase tracking-wider text-black/40">ToC Exists:</p>
                              <div className="flex items-center gap-2">
                                {result.tocExists ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-rose-500" />
                                )}
                                <span className="text-sm font-bold">{result.tocExists ? 'YES' : 'NO'}</span>
                              </div>
                            </div>

                            {result.tocExists && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                  { label: 'Placement', value: result.placementRespected },
                                  { label: 'HTML Tags', value: result.htmlTagsRespected },
                                  { label: 'Keywords', value: result.keywordsRespected },
                                  { label: 'Nesting', value: result.nestingRespected }
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
                        <div className="md:w-1/3 space-y-4">
                          <div className="bg-[#f9f9f9] p-6 rounded-xl border border-black/5">
                            <h5 className="text-xs font-bold uppercase tracking-wider text-black/40 mb-3 flex items-center gap-2">
                              <Lightbulb className="w-3 h-3" /> Suggestions
                            </h5>
                            <div className="prose prose-sm max-w-none text-sm text-black/70 leading-relaxed">
                              <Markdown>{result.suggestions}</Markdown>
                            </div>
                          </div>
                          <div className="bg-[#f9f9f9] p-6 rounded-xl border border-black/5">
                            <h5 className="text-xs font-bold uppercase tracking-wider text-black/40 mb-3">Summary</h5>
                            <div className="prose prose-sm max-w-none text-sm text-black/70 leading-relaxed">
                              <Markdown>{result.summary}</Markdown>
                            </div>
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
          &copy; {new Date().getFullYear()} VW SEO/GEO ToC Control Elements Tool. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
