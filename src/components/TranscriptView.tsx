'use client';

import { useEffect, useRef } from 'react';

interface TranscriptViewProps {
  transcript: string;
  isRecording?: boolean;
}

export function TranscriptView({ transcript, isRecording = false }: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full min-h-[200px]">

      {/* 标题栏 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">实时转写</span>
          {isRecording && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
          )}
        </div>
        {transcript && (
          <span className="text-xs text-gray-400">{transcript.length} 字</span>
        )}
      </div>

      {/* 内容区 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 min-h-0"
      >
        {transcript ? (
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {transcript}
            {isRecording && (
              <span className="inline-block ml-0.5 w-0.5 h-4 bg-blue-500 animate-pulse align-middle" />
            )}
          </p>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">
              {isRecording ? '正在聆听，请开始讲话...' : '开始录音后，转写内容将实时显示在这里'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
