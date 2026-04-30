'use client';

import { useState, useCallback } from 'react';
import { MeetingRecorder } from '@/components/MeetingRecorder';
import { TranscriptView } from '@/components/TranscriptView';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Cloud, FileText, X, Image as ImageIcon, Loader2 } from 'lucide-react';

// Dynamically import WordCloud to avoid SSR issues with echarts
const WordCloud = dynamic(
  () => import('@/components/WordCloud').then((mod) => mod.WordCloud),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-muted-foreground">加载词云组件中...</div>
      </div>
    )
  }
);

interface ProcessedResult {
  word: string;
  weight: number;
  source?: 'llm' | 'fallback';
}

type AppStatus = 'recording' | 'generating' | 'completed';

export default function HomePage() {
  const [status, setStatus] = useState<AppStatus>('recording');
  const [transcript, setTranscript] = useState('');
  const [processedResults, setProcessedResults] = useState<ProcessedResult[]>([]);
  const [showWordCloud, setShowWordCloud] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, processing: 0, pending: 0, failed: 0 });
  
  // Feature 1: Paste text dialog
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Feature 2: Example image dialog
  const [showExampleDialog, setShowExampleDialog] = useState(false);
  
  // Track if recording is stopped and all chunks processed
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [allChunksProcessed, setAllChunksProcessed] = useState(false);

  const handleTranscriptChange = useCallback((fullTranscript: string) => {
    setTranscript(fullTranscript);
  }, []);

  const handleProcessedResultsChange = useCallback((results: ProcessedResult[]) => {
    setProcessedResults(results);
  }, []);

  const handleProgressUpdate = useCallback((newProgress: { completed: number; processing: number; pending: number; failed: number }) => {
    setProgress(newProgress);
    // Check if all chunks are processed (no pending or processing chunks)
    if (recordingStopped && newProgress.pending === 0 && newProgress.processing === 0 && (newProgress.completed > 0 || newProgress.failed > 0)) {
      setAllChunksProcessed(true);
    }
  }, [recordingStopped]);

  const handleAutoStop = useCallback(() => {
    setStatus('completed');
    setRecordingStopped(true);
    setShowWordCloud(true);
  }, []);

  const handleRecordingStopped = useCallback(() => {
    setRecordingStopped(true);
  }, []);

  const handleGenerateWordCloud = useCallback(() => {
    if (processedResults.length > 0 || transcript.length > 0) {
      setStatus('generating');
      setShowWordCloud(true);
    }
  }, [processedResults, transcript]);

  // Feature 1: Handle paste text word cloud generation
  const handlePasteGenerate = useCallback(async () => {
    if (!pasteText.trim()) return;
    
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText.trim() }),
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const { words } = await response.json();
      if (words && words.length > 0) {
        setProcessedResults(words.map((w: { word: string; weight: number }) => ({
          word: w.word,
          weight: w.weight,
          source: 'llm' as const,
        })));
        setStatus('generating');
        setShowWordCloud(true);
        setShowPasteDialog(false);
        setPasteText('');
      }
    } catch (error) {
      console.error('Paste analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [pasteText]);

  const handleReset = useCallback(() => {
    setStatus('recording');
    setTranscript('');
    setProcessedResults([]);
    setShowWordCloud(false);
    setProgress({ completed: 0, processing: 0, pending: 0, failed: 0 });
    setRecordingStopped(false);
    setAllChunksProcessed(false);
  }, []);

  const hasContent = processedResults.length > 0 || transcript.length > 0;

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
                <h1 className="text-xl font-bold text-green-800">会议助手</h1>
                <p className="text-sm text-green-600">智能录音转文字，词云分析</p>
              </div>
            </div>
            {/* Feature 1: 会议记录 button */}
            <Button
              onClick={() => setShowPasteDialog(true)}
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              <FileText className="mr-2 h-4 w-4" />
              会议记录
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Mobile: Stacked Layout */}
        <div className="lg:hidden space-y-4">
          {/* Recorder Card */}
          <MeetingRecorder
            onTranscriptChange={handleTranscriptChange}
            onProcessedResultsChange={handleProcessedResultsChange}
            onProgressUpdate={handleProgressUpdate}
            onAutoStop={handleAutoStop}
            onRecordingStopped={handleRecordingStopped}
          />

          {/* Progress Indicator (Mobile) */}
          {(progress.completed > 0 || progress.pending > 0) && (
            <div className="bg-white rounded-lg p-3 border border-green-100">
              <div className="text-sm">
                <span className="text-green-600">已处理: {progress.completed} 片段</span>
                {progress.pending > 0 && (
                  <span className="text-orange-500 ml-3">待处理: {progress.pending} 片段</span>
                )}
                {progress.failed > 0 && (
                  <span className="text-red-500 ml-3">失败: {progress.failed} 片段</span>
                )}
              </div>
            </div>
          )}

          {/* Generate Buttons (Mobile) */}
         

          {/* Feature 2: Dual buttons after recording stops and all chunks processed */}
          {recordingStopped && allChunksProcessed && (
            <div className="relative w-full items-center">
              <Button
                onClick={handleGenerateWordCloud}
                size="lg"
                className="relative z-10 w-full bg-green-500 hover:bg-green-600"
                disabled={!hasContent}
              >
                <Cloud className="mr-2 h-5 w-5" />
                生成词云
              </Button>
              <Button
                onClick={() => setShowExampleDialog(true)}
                size="lg"
                className="absolute inset-0 w-full bg-green-100  text-green-800 border-2 border-green-300 py-5 text-lg"
                variant="outline"
              >
                
                {/*<ImageIcon className="mr-2 h-6 w-6" />
                查看例图*/}
              </Button>
            </div>
          )}

          {/* Transcript View */}
          <TranscriptView
            transcript={transcript}
            isRecording={status === 'recording'}
          />

          {/* Word Cloud */}
          {showWordCloud && (
            <WordCloud
              processedResults={processedResults}
              onReset={handleReset}
            />
          )}
        </div>

        {/* Desktop: Two Column Layout */}
        <div className="hidden lg:grid grid-cols-2 gap-6" style={{ minHeight: 'calc(100vh - 200px)' }}>
          {/* Left Column */}
          <div className="space-y-4 flex flex-col">
            <MeetingRecorder
              onTranscriptChange={handleTranscriptChange}
              onProcessedResultsChange={handleProcessedResultsChange}
              onProgressUpdate={handleProgressUpdate}
              onAutoStop={handleAutoStop}
              onRecordingStopped={handleRecordingStopped}
            />

            {/* Progress Indicator (Desktop) */}
            {(progress.completed > 0 || progress.pending > 0) && (
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-sm">
                  <span className="text-green-600">已处理: {progress.completed} 片段</span>
                  {progress.pending > 0 && (
                    <span className="text-orange-500 ml-3">待处理: {progress.pending} 片段</span>
                  )}
                  {progress.failed > 0 && (
                    <span className="text-red-500 ml-3">失败: {progress.failed} 片段</span>
                  )}
                </div>
              </div>
            )}

            

            {/* Feature 2: Dual buttons after recording stops and all chunks processed */}
            {recordingStopped && allChunksProcessed && (
              <div className="relative w-full items-center">
                <Button
                  onClick={handleGenerateWordCloud}
                  size="lg"
                  className="relative z-10 w-full bg-green-500 hover:bg-green-600"
                  disabled={!hasContent}
                >
                  <Cloud className="mr-2 h-5 w-5" />
                  生成词云
                </Button>
                <Button
                  onClick={() => setShowExampleDialog(true)}
                  size="lg"
                  className="absolute inset-0 w-full bg-green-100 hover:bg-green-200 text-green-800 border-2 border-green-300 py-6 text-lg"
                  variant="outline"
                >
                  {/*  <ImageIcon className="mr-2 h-6 w-6" />
                  查看例图*/}
                </Button>
              </div>
            )}

            <div className="flex-1 min-h-0">
              <TranscriptView
                transcript={transcript}
                isRecording={status === 'recording'}
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col">
            {showWordCloud ? (
              <WordCloud
                processedResults={processedResults}
                onReset={handleReset}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-white rounded-lg border-2 border-dashed border-green-200">
                <div className="text-center">
                  <Cloud className="w-16 h-16 mx-auto text-green-200 mb-4" />
                  <p className="text-green-600 font-medium">
                    {status === 'recording'
                      ? '开始会议后点击"生成词云"查看分析结果'
                      : '点击上方"会议开始"开始录制'}
                  </p>
                  <p className="text-sm text-green-400 mt-2">
                    支持最多2小时录音，自动后台处理
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
          <p>会议助手 - 智能录音转文字，词云分析</p>
          <p className="mt-1 text-green-400">
            支持 Chrome、Safari、Edge 等主流浏览器
          </p>
        </div>
      </footer>

      {/* Feature 1: Paste Text Dialog */}
      {showPasteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-green-100">
              <h2 className="text-lg font-semibold text-green-800">粘贴文稿</h2>
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
                  const val = e.target.value;
                  if (val.length <= 5000) {
                    setPasteText(val);
                  }
                }}
                placeholder="请粘贴会议文稿内容，最多5000字..."
                className="w-full h-48 p-3 border border-green-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent text-sm"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {pasteText.length}/5000
                </span>
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
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    正在分析...
                  </>
                ) : (
                  <>
                    <Cloud className="mr-2 h-5 w-5" />
                    生成词云
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Feature 2: Example Image Dialog */}
      {showExampleDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowExampleDialog(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-green-100">
              <h2 className="text-lg font-semibold text-green-800">词云</h2>
              <button
                onClick={() => setShowExampleDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center min-h-[300px]">
              {/* Placeholder image - replace with actual word cloud example */}
              <img
                src="/wordcloud-example.png"
                alt="词云例图"
                className="max-w-full max-h-[500px] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
