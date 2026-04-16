'use client';

import { useState, useCallback } from 'react';
import { MeetingRecorder } from '@/components/MeetingRecorder';
import { TranscriptView } from '@/components/TranscriptView';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Cloud } from 'lucide-react';

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

  const handleTranscriptChange = useCallback((fullTranscript: string) => {
    setTranscript(fullTranscript);
  }, []);

  const handleProcessedResultsChange = useCallback((results: ProcessedResult[]) => {
    setProcessedResults(results);
  }, []);

  const handleProgressUpdate = useCallback((newProgress: { completed: number; processing: number; pending: number; failed: number }) => {
    setProgress(newProgress);
  }, []);

  const handleAutoStop = useCallback(() => {
    setStatus('completed');
    setShowWordCloud(true);
  }, []);

  const handleGenerateWordCloud = useCallback(() => {
    if (processedResults.length > 0 || transcript.length > 0) {
      setStatus('generating');
      setShowWordCloud(true);
    }
  }, [processedResults, transcript]);

  const handleReset = useCallback(() => {
    setStatus('recording');
    setTranscript('');
    setProcessedResults([]);
    setShowWordCloud(false);
    setProgress({ completed: 0, processing: 0, pending: 0, failed: 0 });
  }, []);

  const hasContent = processedResults.length > 0 || transcript.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-green-100">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-green-800">会议助手</h1>
              <p className="text-sm text-green-600">智能录音转文字，词云分析</p>
            </div>
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

          {/* Generate Button (Mobile) */}
          {status === 'recording' && hasContent && (
            <Button
              onClick={handleGenerateWordCloud}
              size="lg"
              className="w-full bg-green-500 hover:bg-green-600"
            >
              <Cloud className="mr-2 h-5 w-5" />
              生成词云
            </Button>
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

            {/* Generate Button (Desktop) */}
            {status === 'recording' && hasContent && (
              <Button
                onClick={handleGenerateWordCloud}
                size="lg"
                className="bg-green-500 hover:bg-green-600"
              >
                <Cloud className="mr-2 h-5 w-5" />
                生成词云
              </Button>
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
    </div>
  );
}
