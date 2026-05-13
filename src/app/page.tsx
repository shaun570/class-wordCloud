'use client';

import { useState, useCallback, useRef } from 'react';
import { MeetingRecorder } from '@/components/MeetingRecorder';
import { TranscriptView } from '@/components/TranscriptView';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import {
  FileText, X, Loader2,
  BookOpen, Lightbulb, BarChart2,
  ChevronDown, ChevronUp, FileDown,
  Mic, ChevronDownIcon
} from 'lucide-react';

const WordCloud = dynamic(
  () => import('@/components/WordCloud').then((mod) => mod.WordCloud),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-gray-400 text-sm">词云加载中...</div>
      </div>
    ),
  }
);

// ─── 类型定义 ──────────────────────────────────────────────────
interface ProcessedResult {
  word: string;
  weight: number;
  source?: 'llm' | 'fallback';
}

interface ClassSummary {
  mainTopics: string[];
  teachingFlow: string;
  keyConceptsRepeated: string[];
  suggestions: string[];
}

type AppStatus = 'idle' | 'recording' | 'generating' | 'completed';

// ─── 学科配置 ──────────────────────────────────────────────────
const SUBJECTS = [
  { value: 'geography', label: '地理', icon: '🌍' },
  { value: 'history',   label: '历史', icon: '📜' },
  { value: 'chinese',   label: '语文', icon: '📖' },
  { value: 'math',      label: '数学', icon: '📐' },
  { value: 'english',   label: '英语', icon: '🔤' },
  { value: 'physics',   label: '物理', icon: '⚛️' },
  { value: 'chemistry', label: '化学', icon: '🧪' },
  { value: 'biology',   label: '生物', icon: '🧬' },
  { value: 'general',   label: '通用', icon: '📚' },
];

// ─── 学科下拉选择器 ────────────────────────────────────────────
function SubjectDropdown({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = SUBJECTS.find((s) => s.value === value) ?? SUBJECTS[8];

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={[
          'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all min-w-[120px]',
          'bg-white border-blue-200 text-blue-800 shadow-sm',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-blue-400 hover:shadow cursor-pointer',
        ].join(' ')}
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <ChevronDownIcon
          className={`w-4 h-4 ml-auto text-blue-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          {/* 遮罩层关闭下拉 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-blue-100 rounded-xl shadow-lg overflow-hidden w-36">
            {SUBJECTS.map((s) => (
              <button
                key={s.value}
                onClick={() => { onChange(s.value); setOpen(false); }}
                className={[
                  'w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left',
                  value === s.value
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 课堂摘要卡片 ──────────────────────────────────────────────
function ClassSummaryCard({
  summary,
  subject,
}: {
  summary: ClassSummary;
  subject: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const subjectLabel = SUBJECTS.find((s) => s.value === subject)?.label || '通用';

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 transition-all"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-white/80" />
          <span className="font-semibold text-white text-sm">
            课堂分析报告 · {subjectLabel}
          </span>
          <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
            自动生成
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-white/70" />
          : <ChevronDown className="w-4 h-4 text-white/70" />}
      </button>

      {expanded && (
        <div className="p-5 space-y-4">
          {summary.mainTopics?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700 tracking-wide uppercase">
                  本节课知识点
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.mainTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-sm font-medium"
                  >
                    {i + 1}. {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.teachingFlow && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <div className="w-3.5 h-3.5 rounded-full bg-sky-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-sky-600 tracking-wide uppercase">
                  教学脉络
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed bg-sky-50 border border-sky-100 rounded-lg p-3.5">
                {summary.teachingFlow}
              </p>
            </div>
          )}

          {summary.keyConceptsRepeated?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-sm">🔑</span>
                <span className="text-xs font-semibold text-amber-700 tracking-wide uppercase">
                  重点反复强调
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.keyConceptsRepeated.map((concept, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium border border-amber-200"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.suggestions?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Lightbulb className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-indigo-600 tracking-wide uppercase">
                  教学建议
                </span>
              </div>
              <ul className="space-y-2">
                {summary.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs flex-shrink-0 font-semibold">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-400 text-right pt-1 border-t border-gray-100">
            以上内容由豆包大模型自动生成，仅供参考
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────
export default function HomePage() {
  const [status, setStatus]                         = useState<AppStatus>('idle');
  const [transcript, setTranscript]                 = useState('');
  const [processedResults, setProcessedResults]     = useState<ProcessedResult[]>([]);
  const [showWordCloud, setShowWordCloud]            = useState(false);
  const [progress, setProgress]                     = useState({ completed: 0, processing: 0, pending: 0, failed: 0 });
  const [recordingStopped, setRecordingStopped]     = useState(false);
  const [allChunksProcessed, setAllChunksProcessed] = useState(false);
  const [subject, setSubject]                       = useState('general');
  const [classSummary, setClassSummary]             = useState<ClassSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showPasteDialog, setShowPasteDialog]       = useState(false);
  const [pasteText, setPasteText]                   = useState('');
  const [isAnalyzing, setIsAnalyzing]               = useState(false);

  const getWordCloudImageRef = useRef<(() => string | null) | null>(null);

  const handleChartReady = useCallback((getImageFn: () => string | null) => {
    getWordCloudImageRef.current = getImageFn;
  }, []);

  // ── 摘要生成 ────────────────────────────────────────────────
  const generateSummary = useCallback(async (text: string, currentSubject: string) => {
    if (!text || text.length < 20) return;
    setIsGeneratingSummary(true);
    try {
      const res = await fetch('/api/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, subject: currentSubject, generateSummary: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setClassSummary(data.summary);
      }
    } catch (e) {
      console.error('摘要生成失败:', e);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, []);

  // ── 导出报告 ────────────────────────────────────────────────
  const handleExportReport = useCallback(() => {
    const imageDataURL = getWordCloudImageRef.current?.() ?? null;
    const subjectLabel = SUBJECTS.find((s) => s.value === subject)?.label ?? '通用';
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const topWords = [...processedResults].sort((a, b) => b.weight - a.weight).slice(0, 20);

    const printHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>课堂分析报告</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto}
    .header{background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:12px;padding:24px 28px;margin-bottom:28px;color:white}
    .title{font-size:22px;font-weight:bold}
    .subtitle{font-size:12px;opacity:.8;margin-top:4px}
    .header-row{display:flex;justify-content:space-between;align-items:flex-start}
    .meta{text-align:right;font-size:12px;opacity:.8;line-height:1.8}
    .subject-badge{display:inline-block;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);border-radius:20px;padding:3px 12px;font-size:13px;font-weight:600;margin-top:8px}
    .section{margin-bottom:24px}
    .section-title{font-size:13px;font-weight:700;color:#1d4ed8;border-left:3px solid #3b82f6;padding-left:10px;margin-bottom:12px;letter-spacing:.05em}
    .tags{display:flex;flex-wrap:wrap;gap:8px}
    .tag{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:500}
    .flow-box{background:#f0f9ff;border-left:3px solid #38bdf8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.8;color:#0369a1}
    .concept-tag{background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600}
    .suggestions{list-style:none}
    .suggestions li{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;line-height:1.6}
    .suggestions li:last-child{border-bottom:none}
    .suggest-num{width:22px;height:22px;background:#ede9fe;color:#7c3aed;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0}
    .wordcloud-img{width:100%;max-height:320px;object-fit:contain;border:1px solid #e5e7eb;border-radius:8px}
    .no-wordcloud{height:100px;border:2px dashed #bfdbfe;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#93c5fd;font-size:13px}
    .keyword-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
    .keyword-item{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:12px;display:flex;justify-content:space-between;align-items:center}
    .keyword-name{font-weight:600;color:#374151}
    .keyword-weight{color:#94a3b8;font-size:11px}
    .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    @media print{body{padding:20px}@page{margin:15mm}}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-row">
      <div>
        <div class="title">课堂分析报告</div>
        <div class="subtitle">课堂智析助手 · 智能教学辅助系统</div>
        <div class="subject-badge">${subjectLabel}</div>
      </div>
      <div class="meta"><div>${dateStr}</div><div>${timeStr}</div></div>
    </div>
  </div>

  ${classSummary ? `
    ${classSummary.mainTopics?.length > 0 ? `
    <div class="section">
      <div class="section-title">本节课知识点</div>
      <div class="tags">${classSummary.mainTopics.map((t, i) => `<span class="tag">${i + 1}. ${t}</span>`).join('')}</div>
    </div>` : ''}
    ${classSummary.teachingFlow ? `
    <div class="section">
      <div class="section-title">教学脉络</div>
      <div class="flow-box">${classSummary.teachingFlow}</div>
    </div>` : ''}
    ${classSummary.keyConceptsRepeated?.length > 0 ? `
    <div class="section">
      <div class="section-title">重点强调概念</div>
      <div class="tags">${classSummary.keyConceptsRepeated.map((c) => `<span class="concept-tag">${c}</span>`).join('')}</div>
    </div>` : ''}
    ${classSummary.suggestions?.length > 0 ? `
    <div class="section">
      <div class="section-title">教学建议</div>
      <ul class="suggestions">${classSummary.suggestions.map((s, i) => `<li><span class="suggest-num">${i + 1}</span><span>${s}</span></li>`).join('')}</ul>
    </div>` : ''}
  ` : '<div class="section"><p style="color:#6b7280;font-size:14px">本次未生成课堂分析（文本内容不足）</p></div>'}

  <div class="section">
    <div class="section-title">词云图</div>
    ${imageDataURL
      ? `<img class="wordcloud-img" src="${imageDataURL}" alt="词云图"/>`
      : `<div class="no-wordcloud">词云图不可用</div>`}
  </div>

  ${topWords.length > 0 ? `
  <div class="section">
    <div class="section-title">Top 20 高频关键词</div>
    <div class="keyword-grid">
      ${topWords.map((w, i) => `
        <div class="keyword-item">
          <span class="keyword-name">${i + 1}. ${w.word}</span>
          <span class="keyword-weight">${w.weight.toFixed(1)}</span>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <div class="footer">
    <span>课堂智析助手 · 豆包大模型（字节跳动）提供技术支持</span>
    <span>自动生成内容，仅供参考</span>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('请允许弹出窗口以导出报告'); return; }
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.onload = () => setTimeout(() => printWindow.print(), 500);
  }, [subject, classSummary, processedResults]);

  // ── 事件回调 ────────────────────────────────────────────────
  const handleTranscriptChange = useCallback((t: string) => setTranscript(t), []);
  const handleProcessedResultsChange = useCallback((r: ProcessedResult[]) => setProcessedResults(r), []);

  const handleProgressUpdate = useCallback(
    (p: { completed: number; processing: number; pending: number; failed: number }) => {
      setProgress(p);
      if (recordingStopped && p.pending === 0 && p.processing === 0 && (p.completed > 0 || p.failed > 0)) {
        setAllChunksProcessed(true);
      }
    },
    [recordingStopped]
  );

  const handleAutoStop = useCallback(() => {
    setStatus('completed');
    setRecordingStopped(true);
    setShowWordCloud(true);
  }, []);

  const handleRecordingStopped = useCallback(() => setRecordingStopped(true), []);
  const handleRecordingStart   = useCallback(() => setStatus('recording'), []);

  const handleGenerateWordCloud = useCallback(() => {
    if (processedResults.length > 0 || transcript.length > 0) {
      setStatus('generating');
      setShowWordCloud(true);
      if (transcript.length > 50) {
        generateSummary(transcript, subject);
      } else if (processedResults.length >= 3) {
        const wordsText = processedResults
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 30)
          .map((w) => w.word)
          .join('，');
        generateSummary(`本节课涉及以下知识点和关键词：${wordsText}`, subject);
      }
    }
  }, [processedResults, transcript, subject, generateSummary]);

  const handlePasteGenerate = useCallback(async () => {
    if (!pasteText.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText.trim(), subject, generateSummary: true }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (data.words?.length > 0) {
        setProcessedResults(data.words.map((w: { word: string; weight: number }) => ({
          word: w.word, weight: w.weight, source: 'llm' as const,
        })));
        if (data.summary) setClassSummary(data.summary);
        setStatus('generating');
        setShowWordCloud(true);
        setShowPasteDialog(false);
        setPasteText('');
      }
    } catch (e) {
      console.error('粘贴分析失败:', e);
    } finally {
      setIsAnalyzing(false);
    }
  }, [pasteText, subject]);

  const handleReset = useCallback(() => {
    setStatus('idle');
    setTranscript('');
    setProcessedResults([]);
    setShowWordCloud(false);
    setProgress({ completed: 0, processing: 0, pending: 0, failed: 0 });
    setRecordingStopped(false);
    setAllChunksProcessed(false);
    setClassSummary(null);
    getWordCloudImageRef.current = null;
  }, []);

  const hasContent  = processedResults.length > 0 || transcript.length > 0;
  const isRecording = status === 'recording';

  const recorderProps = {
    subject,
    onTranscriptChange:       handleTranscriptChange,
    onProcessedResultsChange: handleProcessedResultsChange,
    onProgressUpdate:         handleProgressUpdate,
    onAutoStop:               handleAutoStop,
    onRecordingStopped:       handleRecordingStopped,
    onRecordingStart:         handleRecordingStart,
  };

  const wordCloudProps = {
    processedResults,
    onReset:      handleReset,
    onChartReady: handleChartReady,
  };

  // ── 可复用区块 ───────────────────────────────────────────────
  const ProgressBlock = (progress.completed > 0 || progress.pending > 0) && (
    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-sm flex flex-wrap gap-x-4 gap-y-1">
      <span className="text-blue-600 font-medium">✓ 已处理 {progress.completed} 片段</span>
      {progress.pending > 0  && <span className="text-amber-600">⏳ 待处理 {progress.pending} 片段</span>}
      {progress.failed  > 0  && <span className="text-red-500">✗ 失败 {progress.failed} 片段</span>}
    </div>
  );

  const ActionBlock = recordingStopped && allChunksProcessed && (
    <div className="space-y-2">
      <button
        onClick={handleGenerateWordCloud}
        disabled={!hasContent}
        className={[
          'w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all',
          hasContent
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed',
        ].join(' ')}
      >
        <BarChart2 className="w-4 h-4" />
        生成词云与课堂分析
      </button>
      {showWordCloud && (
        <button
          onClick={handleExportReport}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition-all"
        >
          <FileDown className="w-4 h-4" />
          导出课堂报告（PDF）
        </button>
      )}
    </div>
  );

  const SummaryBlock = (
    <>
      {isGeneratingSummary && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          正在生成课堂分析报告，请稍候...
        </div>
      )}
      {classSummary && !isGeneratingSummary && (
        <ClassSummaryCard summary={classSummary} subject={subject} />
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-0">
          <div className="flex items-center justify-between h-14">

            {/* Logo 区 */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800 text-base">课堂智析助手</span>
                <span className="hidden sm:inline-block text-xs text-gray-400 border-l border-gray-200 pl-2 ml-1">
                  智能课堂录音分析系统
                </span>
              </div>
            </div>

            {/* 右侧操作 */}
            <div className="flex items-center gap-3">
              {/* 学科选择器（Header 内） */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 hidden sm:inline">当前学科</span>
                <SubjectDropdown
                  value={subject}
                  onChange={setSubject}
                  disabled={isRecording}
                />
              </div>

              <div className="w-px h-6 bg-gray-200" />

              <button
                onClick={() => setShowPasteDialog(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">粘贴文稿</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero Banner ── */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold mb-1">课堂录音智能分析</h2>
            <p className="text-blue-100 text-sm leading-relaxed">
              录制课堂音频，自动转写、提取关键词、生成词云与教学分析报告，助力教学质量提升。
            </p>
            {/* 步骤提示 */}
            <div className="flex items-center gap-1.5 mt-4 flex-wrap">
              {['选择学科', '开始录音', '停止录音', '生成分析', '导出报告'].map((step, i, arr) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold">
                      {i + 1}
                    </span>
                    {step}
                  </div>
                  {i < arr.length - 1 && (
                    <span className="text-blue-300 text-xs">›</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="container mx-auto px-4 py-6">

        {/* Mobile */}
        <div className="lg:hidden space-y-4">
          <MeetingRecorder {...recorderProps} />
          {ProgressBlock}
          {ActionBlock}
          {SummaryBlock}
          <TranscriptView transcript={transcript} isRecording={isRecording} />
          {showWordCloud && <WordCloud {...wordCloudProps} />}
        </div>

        {/* Desktop */}
        <div className="hidden lg:grid grid-cols-5 gap-6" style={{ minHeight: 'calc(100vh - 280px)' }}>

          {/* 左栏 2/5 */}
          <div className="col-span-2 space-y-4 flex flex-col">
            <MeetingRecorder {...recorderProps} />
            {ProgressBlock}
            {ActionBlock}
            {SummaryBlock}
            <div className="flex-1 min-h-0">
              <TranscriptView transcript={transcript} isRecording={isRecording} />
            </div>
          </div>

          {/* 右栏 3/5 */}
          <div className="col-span-3 flex flex-col">
            {showWordCloud ? (
              <WordCloud {...wordCloudProps} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-blue-200 min-h-[400px]">
                {/* 装饰圆 */}
                <div className="w-24 h-24 rounded-full bg-blue-50 border-2 border-blue-100 flex items-center justify-center mb-5">
                  <BarChart2 className="w-10 h-10 text-blue-300" />
                </div>
                <p className="text-gray-600 font-medium text-base mb-1">词云与分析将在此处展示</p>
                <p className="text-sm text-gray-400 text-center max-w-xs leading-relaxed">
                  选择学科后开始录音，停止录音后点击"生成词云与课堂分析"
                </p>
                {/* 学科快捷提示 */}
                <div className="mt-5 flex items-center gap-2 text-xs text-gray-400">
                  <span>当前学科：</span>
                  <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                    {SUBJECTS.find(s => s.value === subject)?.icon}{' '}
                    {SUBJECTS.find(s => s.value === subject)?.label}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-white mt-8 py-5">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
            <span>© 课堂智析助手 · 智能教学辅助系统</span>
            <span>豆包大模型（字节跳动）提供技术支持 · 支持 Chrome / Safari / Edge</span>
          </div>
        </div>
      </footer>

      {/* ── 粘贴文稿弹框 ── */}
      {showPasteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100">

            {/* 弹框头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-800">粘贴课堂文稿</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  当前学科：{SUBJECTS.find((s) => s.value === subject)?.icon} {SUBJECTS.find((s) => s.value === subject)?.label}
                </p>
              </div>
              <button
                onClick={() => { setShowPasteDialog(false); setPasteText(''); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 文本区 */}
            <div className="p-5">
              <textarea
                value={pasteText}
                onChange={(e) => { if (e.target.value.length <= 5000) setPasteText(e.target.value); }}
                placeholder="请粘贴课堂文稿内容，最多 5000 字..."
                className="w-full h-44 p-3.5 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm text-gray-700 leading-relaxed"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{pasteText.length} / 5000</span>
                <span className="text-xs text-blue-500">将同时生成词云和课堂分析报告</span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="px-5 pb-5">
              <button
                onClick={handlePasteGenerate}
                disabled={!pasteText.trim() || isAnalyzing}
                className={[
                  'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all',
                  pasteText.trim() && !isAnalyzing
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                ].join(' ')}
              >
                {isAnalyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />正在分析中...</>
                ) : (
                  <><BarChart2 className="w-4 h-4" />生成词云与课堂分析</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
