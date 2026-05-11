'use client';

import { useState, useCallback } from 'react';
import { MeetingRecorder } from '@/components/MeetingRecorder';
import { TranscriptView } from '@/components/TranscriptView';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Cloud, FileText, X, Loader2, BookOpen, Lightbulb, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';

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

// ─── 类型定义 ─────────────────────────────────────────────────
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

// ─── 学科配置 ─────────────────────────────────────────────────
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

// ─── 课堂摘要卡片组件 ─────────────────────────────────────────
function ClassSummaryCard({ summary, subject }: { summary: ClassSummary; subject: string }) {
  const [expanded, setExpanded] = useState(true);
  const subjectLabel = SUBJECTS.find(s => s.value === subject)?.label || '📚 通用';

  return (
    <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
      {/* 卡片标题栏 */}
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
          : <ChevronDown className="w-4 h-4 text-green-500" />
        }
      </button>

      {expanded && (
        <div className="p-4 space-y-4">

          {/* 主要知识点 */}
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

          {/* 教学脉络 */}
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

          {/* 反复强调的概念 */}
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

          {/* 教学建议 */}
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

// ─── 学科选择器组件 ───────────────────────────────────────────
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
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border
            ${value === s.value
              ? 'bg-green-500 text-white border-green-500 shadow-sm'
              : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────
export default function HomePage() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [processedResults, setProcessedResults] = useState<ProcessedResult[]>([]);
  const [showWordCloud, setShowWordCloud] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, processing: 0, pending: 0, failed: 0 });
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [allChunksProcessed, setAllChunksProcessed] = useState(false);

  // 学科选择
  const [subject, setSubject] = useState('general');

  // 课堂摘要
  const [classSummary, setClassSummary] = useState<ClassSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // 粘贴文稿弹框
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ── 摘要生成函数 ────────────────────────────────────────────
  const generateSummary = useCallback(async (text: string, currentSubject: string) => {
    if (!text || text.length < 50) return;
    setIsGeneratingSummary(true);
    try {
      const response = await fetch('/api/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          subject: currentSubject,
          generateSummary: true,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          setClassSummary(data.summary);
        }
      }
    } catch (e) {
      console.error('摘要生成失败:', e);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, []);

  // ── 回调函数 ─────────────────────────────────────────────────
  const handleTranscriptChange = useCallback((fullTranscript: string) => {
    setTranscript(fullTranscript);
  }, []);

  const handleProcessedResultsChange = useCallback((results: ProcessedResult[]) => {
    setProcessedResults(results);
  }, []);

  const handleProgressUpdate = useCallback(
    (newProgress: { completed: number; processing: number; pending: number; failed: number }) => {
      setProgress(newProgress);
      if (
        recordingStopped &&
        newProgress.pending === 0 &&
        newProgress.processing === 0 &&
        (newProgress.completed > 0 || newProgress.failed > 0)
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

  const handleRecordingStopped = useCallback(() => {
    setRecordingStopped(true);
  }, []);

  const handleRecordingStart = useCallback(() => {
    setStatus('recording');
  }, []);

  // 生成词云，同时触发摘要生成
  const handleGenerateWordCloud = useCallback(() => {
    if (processedResults.length > 0 || transcript.length > 0) {
      setStatus('generating');
      setShowWordCloud(true);
      // 同步触发摘要生成
      if (transcript.length > 50) {
        generateSummary(transcript, subject);
      }
    }
  }, [processedResults, transcript, subject, generateSummary]);

  // 粘贴文稿生成词云
  const handlePasteGenerate = useCallback(async () => {
    if (!pasteText.trim()) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText.trim(),
          subject,
          generateSummary: true,
        }),
      });
      if (!response.ok) throw new Error('Analysis failed');
      const data = await response.json();
      if (data.words?.length > 0) {
        setProcessedResults(
          data.words.map((w: { word: string; weight: number }) => ({
            word: w.word,
            weight: w.weight,
            source: 'llm' as const,
          }))
        );
        if (data.summary) setClassSummary(data.summary);
        setStatus('generating');
        setShowWordCloud(true);
        setShowPasteDialog(false);
        setPasteText('');
      }
    } catch (error) {
      console.error('粘贴分析失败:', error);
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
  }, []);

  const hasContent = processedResults.length > 0 || transcript.length > 0;
  const isRecording = status === 'recording' && !recordingStopped;

  // ── 学科选择区块 ─────────────────────────────────────────────
  const SubjectSection = (
    <div className="bg-white rounded-xl border border-green-100 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-green-600" />
        <span className="text-sm font-semibold text-green-800">选择学科</span>
        {isRecording && (
          <span className="text-xs text-gray-400">（录音中不可更改）</span>
        )}
      </div>
      <SubjectSelector
        value={subject}
        onChange={setSubject}
        disabled={isRecording}
      />
    </div>
  );

  // ── 进度区块 ─────────────────────────────────────────────────
  const ProgressSection = (progress.completed > 0 || progress.pending > 0) && (
    <div className="bg-white rounded-lg p-3 border border-green-100 text-sm">
      <span className="text-green-600">已处理: {progress.completed} 片段</span>
      {progress.pending > 0 && (
        <span className="text-orange-500 ml-3">待处理: {progress.pending} 片段</span>
      )}
      {progress.failed > 0 && (
        <span className="text-red-500 ml-3">失败: {progress.failed} 片段</span>
      )}
    </div>
  );

  // ── 生成按钮区块 ──────────────────────────────────────────────
  const GenerateSection = recordingStopped && allChunksProcessed && (
    <Button
      onClick={handleGenerateWordCloud}
      size="lg"
      className="w-full bg-green-500 hover:bg-green-600 text-white"
      disabled={!hasContent}
    >
      <Cloud className="mr-2 h-5 w-5" />
      生成词云 + 课堂分析
    </Button>
  );

  // ── 摘要区块 ─────────────────────────────────────────────────
  const SummarySection = (
    <>
      {isGeneratingSummary && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          AI正在生成课堂分析报告...
        </div>
      )}
      {classSummary && !isGeneratingSummary && (
        <ClassSummaryCard summary={classSummary} subject={subject} />
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-green-100">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
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
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">

        {/* Mobile Layout */}
        <div className="lg:hidden space-y-4">
          {SubjectSection}
          <MeetingRecorder
            subject={subject}
            onTranscriptChange={handleTranscriptChange}
            onProcessedResultsChange={handleProcessedResultsChange}
            onProgressUpdate={handleProgressUpdate}
            onAutoStop={handleAutoStop}
            onRecordingStopped={handleRecordingStopped}
            onRecordingStart={handleRecordingStart}
          />
          {ProgressSection}
          {GenerateSection}
          {SummarySection}
          <TranscriptView transcript={transcript} isRecording={isRecording} />
          {showWordCloud && (
            <WordCloud processedResults={processedResults} onReset={handleReset} />
          )}
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:grid grid-cols-2 gap-6" style={{ minHeight: 'calc(100vh - 200px)' }}>
          {/* 左栏 */}
          <div className="space-y-4 flex flex-col">
            {SubjectSection}
            <MeetingRecorder
              subject={subject}
              onTranscriptChange={handleTranscriptChange}
              onProcessedResultsChange={handleProcessedResultsChange}
              onProgressUpdate={handleProgressUpdate}
              onAutoStop={handleAutoStop}
              onRecordingStopped={handleRecordingStopped}
            onRecordingStart={handleRecordingStart}
            />
            {ProgressSection}
            {GenerateSection}
            {SummarySection}
            <div className="flex-1 min-h-0">
              <TranscriptView transcript={transcript} isRecording={isRecording} />
            </div>
          </div>

          {/* 右栏 */}
          <div className="flex flex-col">
            {showWordCloud ? (
              <WordCloud processedResults={processedResults} onReset={handleReset} />
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
                  当前学科：{SUBJECTS.find(s => s.value === subject)?.label}
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
                onChange={(e) => {
                  if (e.target.value.length <= 5000) setPasteText(e.target.value);
                }}
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
                {isAnalyzing ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在分析...</>
                ) : (
                  <><Cloud className="mr-2 h-5 w-5" />生成词云 + 课堂分析</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
