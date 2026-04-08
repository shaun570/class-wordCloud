'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TranscriptViewProps {
  transcript: string;
  isRecording?: boolean;
}

export function TranscriptView({ transcript, isRecording = false }: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when transcript updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          实时转写
          {isRecording && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="pr-4">
            {transcript ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {transcript}
                {isRecording && (
                  <span className="inline-block ml-1 animate-pulse">|</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {isRecording
                  ? '正在聆听...请开始说话'
                  : '点击"会议开始"后，语音将实时显示在这里'}
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
