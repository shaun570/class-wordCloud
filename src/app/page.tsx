'use client';

import { useState, useCallback, useRef } from 'react';
import { MeetingRecorder } from '@/components/MeetingRecorder';
import { TranscriptView } from '@/components/TranscriptView';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import {
  Cloud, FileText, X, Loader2,
  BookOpen, Lightbulb, BarChart2,
  ChevronDown, ChevronUp, FileDown
} from 'lucide-react';

const WordCloud = dynamic(
  () => import('@/components/WordCloud').then((mod) => mod.WordCloud),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-muted-foreground">加载词云组件中...</div>
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
  { value: 'geography', label: '🌍 地理' },
  { value: 'history',   label: '📜 历史' },
  { value: 'chinese',   label: '📖 语文' },
  { value: 'math',      label: '📐 数学' },
  { value: 'english',   label: '🔤 英语' },
  { value: 'physics',   label: '⚛️ 物理' },
  { value: 'chemistry', label: '🧪 化学' },
  { value: 'biology',   label: '🧬 生物' },
  { value: 'general',   label: '📚 通用' },
];

// ─── 课堂摘要卡片（纯展示组件，无副作用） ─────────────────────
function ClassSummaryCard({
  summary,
  subject,
}: {
  summary: ClassSummary;
  subject: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const subjectLabel = SUBJECTS.find((s) => s.value === subject)?.label || '📚 通用';

  return (
    <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-green-50 hover:bg-green-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-green-800 text-sm">
            课堂分析报告 · {subjectLabel}
          </span>
          <span className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded-full">
            AI生成
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-green-500" />
          : <ChevronDown className="w-4 h-4 text-green-500" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {summary.mainTopics?.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  本节课知识点
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.mainTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium"
                  >
                    {i + 1}. {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.teachingFlow && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Cloud className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  教学脉络
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed bg-blue-50 rounded-lg p-3">
                {summary.teachingFlow}
              </p>
            </div>
          )}

          {summary.keyConceptsRepeated?.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs">🔑</span>
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  重点反复强调
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.keyConceptsRepeated.map((concept, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium border border-amber-200"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.suggestions?.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  教学建议
                </span>
              </div>
              <ul className="space-y-1">
                {summary.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs flex-shrink-0">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-400 text-right">
            * 以上内容由豆包大模型（字节跳动）AI生成，仅供参考
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 学科选择器（纯展示组件） ──────────────────────────────────
function SubjectSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUBJECTS.map((s) => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          disabled={disabled}
          className={[
            'px-3 py-1.5 rounded-full text-sm font-medium transition-all border',
            value === s.value
              ? 'bg-green-500 text-white border-green-500 shadow-sm'
              : 'bg-white text-green-700 border-green-200 hover:bg-green-50',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────
export default function HomePage() {
  const [status, setStatus]                     = useState<AppStatus>('idle');
  const [transcript, setTranscript]             = useState('');
  const [processedResults, setProcessedResults] = useState<ProcessedResult[]>([]);
  const [showWordCloud, setShowWordCloud]        = useState(false);
  const [progress, setProgress]                 = useState({ completed: 0, processing: 0, pending: 0, failed: 0 });
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [allChunksProcessed, setAllChunksProcessed] = useState(false);
  const [subject, setSubject]                   = useState('general');
  const [classSummary, setClassSummary]         = useState<ClassSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showPasteDialog, setShowPasteDialog]   = useState(false);
  const [pasteText, setPasteText]               = useState('');
  const [isAnalyzing, setIsAnalyzing]           = useState(false);

  // ✅ 修复：用 ref 存储函数，避免 useState 把函数当初始化器执行
  const getWordCloudImageRef = useRef<(() => string | null) | null>(null);

  // ✅ 修复：直接赋值给 ref，不经过 useState
  const handleChartReady = useCallback((getImageFn: () => string | null) => {
    getWordCloudImageRef.current = getImageFn;
  }, []);

  // ── 摘要生成 ────────────────────────────────────────────────
  const generateSummary = useCallback(async (text: string, currentSubject: string) => {
    if (!text || text.length < 50) return;
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
    // ✅ 修复：从 ref 读取函数并调用
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
    .header{border-bottom:3px solid #22c55e;padding-bottom:16px;margin-bottom:28px}
    .header-top{display:flex;justify-content:space-between;align-items:flex-start}
    .title{font-size:24px;font-weight:bold;color:#15803d}
    .subtitle{font-size:13px;color:#6b7280;margin-top:4px}
    .meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.8}
    .subject-badge{display:inline-block;background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:20px;padding:3px 12px;font-size:13px;font-weight:600;margin-top:8px}
    .section{margin-bottom:28px}
    .section-title{font-size:14px;font-weight:700;color:#374151;border-left:4px solid #22c55e;padding-left:10px;margin-bottom:12px;letter-spacing:.05em}
    .tags{display:flex;flex-wrap:wrap;gap:8px}
    .tag{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:500}
    .flow-box{background:#eff6ff;border-left:4px solid #93c5fd;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.8;color:#1e40af}
    .concept-tag{background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600}
    .suggestions{list-style:none}
    .suggestions li{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;line-height:1.6}
    .suggestions li:last-child{border-bottom:none}
    .suggest-num{width:22px;height:22px;background:#ede9fe;color:#7c3aed;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0}
    .wordcloud-img{width:100%;max-height:320px;object-fit:contain;border:1px solid #e5e7eb;border-radius:8px}
    .no-wordcloud{height:120px;border:2px dashed #d1fae5;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:13px}
    .keyword-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
    .keyword-item{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px;display:flex;justify-content:space-between;align-items:center}
    .keyword-name{font-weight:600;color:#374151}
    .keyword-weight{color:#9ca3af;font-size:11px}
    .footer{margin-top:36px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    .ai-badge{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:2px 8px;font-size:10px}
    @media print{body{padding:20px}@page{margin:15mm}}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div>
        <div class="title">📊 课堂分析报告</div>
        <div class="subtitle">课堂智析助手 · AI辅助教学分析</div>
        <div class="subject-badge">${subjectLabel}</div>
      </div>
      <div class="meta"><div>${dateStr}</div><div>${timeStr}</div></div>
    </div>
  </div>

  ${classSummary ? `
    ${classSummary.mainTopics?.length > 0 ? `
    <div class="section">
      <div class="section-title">📚 本节课知识点</div>
      <div class="tags">${classSummary.mainTopics.map((t, i) => `<span class="tag">${i + 1}. ${t}</span>`).join('')}</div>
    </div>` : ''}
    ${classSummary.teachingFlow ? `
    <div class="section">
      <div class="section-title">🌊 教学脉络</div>
      <div class="flow-box">${classSummary.teachingFlow}</div>
    </div>` : ''}
    ${classSummary.keyConceptsRepeated?.length > 0 ? `
    <div class="section">
      <div class="section-title">🔑 重点强调概念</div>
      <div class="tags">${classSummary.keyConceptsRepeated.map((c) => `<span class="concept-tag">${c}</span>`).join('')}</div>
    </div>` : ''}
    ${classSummary.suggestions?.length > 0 ? `
    <div class="section">
      <div class="section-title">💡 教学建议</div>
      <ul class="suggestions">${classSummary.suggestions.map((s, i) => `<li><span class="suggest-num">${i + 1}</span><span>${s}</span></li>`).join('')}</ul>
    </div>` : ''}
  ` : '<div class="section"><p style="color:#6b7280;font-size:14px">本次未生成课堂分析（文本内容不足）</p></div>'}

  <div class="section">
    <div class="section-title">☁️ 词云图</div>
    ${imageDataURL
      ? `<img class="wordcloud-img" src="${imageDataURL}" alt="词云图"/>`
      : `<div class="no-wordcloud">词云图不可用</div>`}
  </div>

  ${topWords.length > 0 ? `
  <div class="section">
    <div class="section-title">🏆 Top 20 关键词</div>
    <div class="keyword-grid">
      ${topWords.map((w, i) => `
        <div class="keyword-item">
          <span class="keyword-name">${i + 1}. ${w.word}</span>
          <span class="keyword-weight">${w.weight.toFixed(1)}</span>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <div class="footer">
    <span>课堂智析助手 · 豆包大模型（字节跳动）提供 AI 支持</span>
    <span class="ai-badge">AI生成内容，仅供参考</span>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('请允许弹出窗口以导出报告'); return; }
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.onload = () => setTimeout(() => printWindow.print(), 500);
  }, [subject, classSummary, processedResults]); // ✅ 不再依赖 getWordCloudImage state

  // ── 事件回调 ────────────────────────────────────────────────
  const handleTranscriptChange = useCallback((t: string) => setTranscript(t), []);

  const handleProcessedResultsChange = useCallback((results: ProcessedResult[]) => {
    setProcessedResults(results);
  }, []);

  const handleProgressUpdate = useCallback(
    (p: { completed: number; processing: number; pending: number; failed: number }) => {
      setProgress(p);
      if (
        recordingStopped && p.pending === 0 && p.processing === 0 &&
        (p.completed > 0 || p.failed > 0)
      ) {
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
      // 正常路径：有转写文本
      generateSummary(transcript, subject);
    } else if (processedResults.length >= 3) {
      // 兜底路径：转写文本不足，用关键词重建文本
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
        setProcessedResults(
          data.words.map((w: { word: string; weight: number }) => ({
            word: w.word, weight: w.weight, source: 'llm' as const,
          }))
        );
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

  // ── 派生状态 ─────────────────────────────────────────────────
  const hasContent  = processedResults.length > 0 || transcript.length > 0;
  const isRecording = status === 'recording';

  // ── 公共 props ───────────────────────────────────────────────
  const recorderProps = {
    subject,
    onTranscriptChange:        handleTranscriptChange,
    onProcessedResultsChange:  handleProcessedResultsChange,
    onProgressUpdate:          handleProgressUpdate,
    onAutoStop:                handleAutoStop,
    onRecordingStopped:        handleRecordingStopped,
    onRecordingStart:          handleRecordingStart,
  };

  const wordCloudProps = {
    processedResults,
    onReset:       handleReset,
    onChartReady:  handleChartReady,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-green-100">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-green-800">课堂智析助手</h1>
              <p className="text-sm text-green-600">课堂录音 → 词云分析 + AI课堂报告</p>
            </div>
          </div>
          <Button
            onClick={() => setShowPasteDialog(true)}
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
          >
            <FileText className="mr-2 h-4 w-4" />
            粘贴文稿
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">

        {/* ── Mobile ── */}
        <div className="lg:hidden space-y-4">

          {/* 学科选择 */}
          <div className="bg-white rounded-xl border border-green-100 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">选择学科</span>
              {isRecording && <span className="text-xs text-gray-400">（录音中不可更改）</span>}
            </div>
            <SubjectSelector value={subject} onChange={setSubject} disabled={isRecording} />
          </div>

          <MeetingRecorder {...recorderProps} />

          {/* 进度 */}
          {(progress.completed > 0 || progress.pending > 0) && (
            <div className="bg-white rounded-lg p-3 border border-green-100 text-sm">
              <span className="text-green-600">已处理: {progress.completed} 片段</span>
              {progress.pending > 0 && <span className="text-orange-500 ml-3">待处理: {progress.pending} 片段</span>}
              {progress.failed  > 0 && <span className="text-red-500 ml-3">失败: {progress.failed} 片段</span>}
            </div>
          )}

          {/* 生成按钮 */}
          {recordingStopped && allChunksProcessed && (
            <div className="space-y-2">
              <Button
                onClick={handleGenerateWordCloud}
                size="lg"
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                disabled={!hasContent}
              >
                <Cloud className="mr-2 h-5 w-5" />
                生成词云 + 课堂分析
              </Button>
              {showWordCloud && (
                <Button
                  onClick={handleExportReport}
                  size="lg"
                  variant="outline"
                  className="w-full border-green-300 text-green-700 hover:bg-green-50"
                >
                  <FileDown className="mr-2 h-5 w-5" />
                  导出课堂报告（PDF）
                </Button>
              )}
            </div>
          )}

          {/* 摘要 */}
          {isGeneratingSummary && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI正在生成课堂分析报告...
            </div>
          )}
          {classSummary && !isGeneratingSummary && (
            <ClassSummaryCard summary={classSummary} subject={subject} />
          )}

          <TranscriptView transcript={transcript} isRecording={isRecording} />
          {showWordCloud && <WordCloud {...wordCloudProps} />}
        </div>

        {/* ── Desktop ── */}
        <div className="hidden lg:grid grid-cols-2 gap-6" style={{ minHeight: 'calc(100vh - 200px)' }}>

          {/* 左栏 */}
          <div className="space-y-4 flex flex-col">

            {/* 学科选择 */}
            <div className="bg-white rounded-xl border border-green-100 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">选择学科</span>
                {isRecording && <span className="text-xs text-gray-400">（录音中不可更改）</span>}
              </div>
              <SubjectSelector value={subject} onChange={setSubject} disabled={isRecording} />
            </div>

            <MeetingRecorder {...recorderProps} />

            {/* 进度 */}
            {(progress.completed > 0 || progress.pending > 0) && (
              <div className="bg-white rounded-lg p-3 border border-green-100 text-sm">
                <span className="text-green-600">已处理: {progress.completed} 片段</span>
                {progress.pending > 0 && <span className="text-orange-500 ml-3">待处理: {progress.pending} 片段</span>}
                {progress.failed  > 0 && <span className="text-red-500 ml-3">失败: {progress.failed} 片段</span>}
              </div>
            )}

            {/* 生成按钮 */}
            {recordingStopped && allChunksProcessed && (
              <div className="space-y-2">
                <Button
                  onClick={handleGenerateWordCloud}
                  size="lg"
                  className="w-full bg-green-500 hover:bg-green-600 text-white"
                  disabled={!hasContent}
                >
                  <Cloud className="mr-2 h-5 w-5" />
                  生成词云 + 课堂分析
                </Button>
                {showWordCloud && (
                  <Button
                    onClick={handleExportReport}
                    size="lg"
                    variant="outline"
                    className="w-full border-green-300 text-green-700 hover:bg-green-50"
                  >
                    <FileDown className="mr-2 h-5 w-5" />
                    导出课堂报告（PDF）
                  </Button>
                )}
              </div>
            )}

            {/* 摘要 */}
            {isGeneratingSummary && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                AI正在生成课堂分析报告...
              </div>
            )}
            {classSummary && !isGeneratingSummary && (
              <ClassSummaryCard summary={classSummary} subject={subject} />
            )}

            <div className="flex-1 min-h-0">
              <TranscriptView transcript={transcript} isRecording={isRecording} />
            </div>
          </div>

          {/* 右栏 */}
          <div className="flex flex-col">
            {showWordCloud ? (
              <WordCloud {...wordCloudProps} />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-white rounded-lg border-2 border-dashed border-green-200">
                <div className="text-center px-8">
                  <Cloud className="w-16 h-16 mx-auto text-green-200 mb-4" />
                  <p className="text-green-600 font-medium">
                    选择学科 → 开始录音 → 生成词云 + 课堂分析
                  </p>
                  <p className="text-sm text-green-400 mt-2">
                    支持地理、历史、语文等9个学科 · 最长2小时
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-green-100 mt-8 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-green-600">
          <p>课堂智析助手 · 豆包大模型（字节跳动）提供 AI 支持</p>
          <p className="mt-1 text-green-400">支持 Chrome、Safari、Edge 等主流浏览器</p>
        </div>
      </footer>

      {/* 粘贴文稿弹框 */}
      {showPasteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-green-100">
              <div>
                <h2 className="text-lg font-semibold text-green-800">粘贴文稿</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  当前学科：{SUBJECTS.find((s) => s.value === subject)?.label}
                </p>
              </div>
              <button
                onClick={() => { setShowPasteDialog(false); setPasteText(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={pasteText}
                onChange={(e) => { if (e.target.value.length <= 5000) setPasteText(e.target.value); }}
                placeholder="请粘贴课堂文稿内容，最多5000字..."
                className="w-full h-48 p-3 border border-green-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">{pasteText.length}/5000</span>
                <span className="text-xs text-green-500">将同时生成词云和课堂分析报告</span>
              </div>
            </div>
            <div className="p-4 pt-0">
              <Button
                onClick={handlePasteGenerate}
                disabled={!pasteText.trim() || isAnalyzing}
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                size="lg"
              >
                {isAnalyzing
                  ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在分析...</>
                  : <><Cloud className="mr-2 h-5 w-5" />生成词云 + 课堂分析</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
