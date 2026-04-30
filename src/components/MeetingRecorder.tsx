'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, MicOff, Square, Loader2, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface AudioChunk {
  id: number;
  blob: Blob;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcript?: string;
  words?: { word: string; weight: number }[];
  retryCount?: number;
}

interface ProcessedResult {
  word: string;
  weight: number;
  source: 'llm' | 'fallback';
}

interface MeetingRecorderProps {
  onTranscriptChange?: (fullTranscript: string) => void;
  onProcessedResultsChange?: (results: ProcessedResult[]) => void;
  onAutoStop?: () => void;
  onProgressUpdate?: (progress: { completed: number; processing: number; pending: number; failed: number }) => void;
  onRecordingStopped?: () => void;
}

type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopped';

const CHUNK_DURATION_MS = 3 * 60 * 1000; // 3 minutes
const MAX_RECORDING_MS = 2 * 60 * 60 * 1000; // 2 hours

export function MeetingRecorder({
  onTranscriptChange,
  onProcessedResultsChange,
  onAutoStop,
  onProgressUpdate,
  onRecordingStopped,
}: MeetingRecorderProps) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const processingRef = useRef<Set<number>>(new Set());
  const chunkIdCounterRef = useRef(0);
  const stopRecordingRef = useRef<() => void>(() => {});

  const fullTranscript = chunks
    .filter((c) => c.status === 'completed' && c.transcript)
    .map((c) => c.transcript!)
    .join('');

  // Keep page alive by playing silent audio periodically
  const startKeepAlive = useCallback(() => {
    const audioContext = new AudioContext();
    const bufferSize = audioContext.sampleRate * 1;
    const silentBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = silentBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = 0;
    }

    const playSilentAudio = () => {
      if (!audioContext || audioContext.state === 'closed') return;
      try {
        const source = audioContext.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(audioContext.destination);
        source.start();
      } catch {
        // Ignore
      }
    };

    playSilentAudio();
    keepAliveIntervalRef.current = setInterval(playSilentAudio, 2000);
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  }, []);

  // Process a single chunk through ASR and LLM
  const processChunk = useCallback(async (chunk: AudioChunk) => {
    if (processingRef.current.has(chunk.id)) return;
    processingRef.current.add(chunk.id);

    try {
      // Determine file extension from MIME type
      const mimeType = chunk.blob.type;
      let extension = 'ogg';
      if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
        extension = 'm4a';
      } else if (mimeType.includes('webm')) {
        extension = 'webm';
      } else if (mimeType.includes('wav')) {
        extension = 'wav';
      }

      // Step 1: ASR transcription
      const formData = new FormData();
      formData.append('audio', chunk.blob, `chunk-${chunk.id}.${extension}`);
      formData.append('chunkId', String(chunk.id));

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeResponse.ok) {
        throw new Error('Transcription failed');
      }

      const { text: transcript, isSilent } = await transcribeResponse.json();

      // If this is a silent chunk, mark as completed with empty text (not an error)
      if (isSilent) {
        setChunks((prev) =>
          prev.map((c) =>
            c.id === chunk.id
              ? { ...c, status: 'completed', transcript: '' }
              : c
          )
        );
        processingRef.current.delete(chunk.id);
        return;
      }

      // Step 2: LLM word analysis
      const analyzeResponse = await fetch('/api/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, chunkId: chunk.id }),
      });

      if (!analyzeResponse.ok) {
        throw new Error('Word analysis failed');
      }

      const { words } = await analyzeResponse.json();

      // Update chunk status
      setChunks((prev) =>
        prev.map((c) =>
          c.id === chunk.id
            ? { ...c, status: 'completed', transcript, words }
            : c
        )
      );
    } catch (error) {
      console.error(`Chunk ${chunk.id} processing failed:`, error);

      // Retry once
      if ((chunk.retryCount || 0) < 1) {
        setChunks((prev) =>
          prev.map((c) =>
            c.id === chunk.id
              ? { ...c, status: 'pending', retryCount: (c.retryCount || 0) + 1 }
              : c
          )
        );
        // Retry after 2 seconds
        setTimeout(() => processChunk({ ...chunk, retryCount: (chunk.retryCount || 0) + 1 }), 2000);
      } else {
        // Give up, mark as failed
        setChunks((prev) =>
          prev.map((c) =>
            c.id === chunk.id ? { ...c, status: 'failed' } : c
          )
        );
        setWarnings((prev) => [...prev, `片段 ${chunk.id} 处理失败，已跳过`]);
      }
    } finally {
      processingRef.current.delete(chunk.id);
    }
  }, []);

  // Start a new chunk recording: stop current recorder → collect data → restart
  const startNewChunk = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    // If no data collected yet, nothing to do
    if (chunksRef.current.length === 0) return;

    // Stop the recorder - this triggers final ondataavailable + onstop
    recorder.stop();

    // The onstop handler will collect data, process it, and restart recording
    recorder.onstop = () => {
      if (chunksRef.current.length > 0) {
        const chunkId = chunkIdCounterRef.current++;
        const mimeType = recorder.mimeType || 'audio/ogg';
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });

        setChunks((prev) => [
          ...prev,
          { id: chunkId, blob: audioBlob, status: 'pending' },
        ]);

        // Trigger processing
        setTimeout(() => {
          processChunk({ id: chunkId, blob: audioBlob, status: 'pending' });
        }, 100);

        chunksRef.current = [];
      }

      // Restart recording for next chunk - new recording gets a fresh container header
      if (mediaRecorderRef.current && mediaStreamRef.current) {
        try {
          mediaRecorderRef.current.start(1000);
        } catch (e) {
          console.error('[Recorder] Failed to restart recording:', e);
        }
      }
    };
  }, [processChunk]);

  const startRecording = useCallback(async () => {
    try {
      setStatus('requesting');
      setChunks([]);
      setWarnings([]);
      chunkIdCounterRef.current = 0;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000,
        },
      });

      mediaStreamRef.current = stream;

      // Try OGG OPUS first (supported by ASR), fallback to MP3 or webm
      let mimeType = 'audio/ogg;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm;codecs=opus';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setStatus('recording');

      // Start timers
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const newTime = prev + 1;
          // Auto-stop after 2 hours
          if (newTime >= MAX_RECORDING_MS / 1000) {
            stopRecordingRef.current();
            onAutoStop?.();
          }
          return newTime;
        });
      }, 1000);

      // Chunk timer (every 3 minutes)
      chunkTimerRef.current = setInterval(() => {
        startNewChunk();
      }, CHUNK_DURATION_MS);

      // Keep page alive
      startKeepAlive();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('idle');
    }
  }, [onAutoStop, startKeepAlive, startNewChunk]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Use onstop to collect final chunk data after recorder flushes
      recorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const chunkId = chunkIdCounterRef.current++;
          const mimeType = recorder.mimeType || 'audio/ogg';
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          setChunks((prev) => [
            ...prev,
            { id: chunkId, blob: audioBlob, status: 'pending' },
          ]);
          processChunk({ id: chunkId, blob: audioBlob, status: 'pending' });
          chunksRef.current = [];
        }

        // Stop the media stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        // Stop timers
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (chunkTimerRef.current) {
          clearInterval(chunkTimerRef.current);
          chunkTimerRef.current = null;
        }

        stopKeepAlive();
        setStatus('stopped');
        onRecordingStopped?.();
      };

      recorder.stop();
    } else {
      // Recorder already stopped, just clean up
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (chunkTimerRef.current) {
        clearInterval(chunkTimerRef.current);
        chunkTimerRef.current = null;
      }
      stopKeepAlive();
      setStatus('stopped');
      onRecordingStopped?.();
    }
  }, [processChunk, stopKeepAlive, onRecordingStopped]);

  // Keep stopRecording ref up to date
  stopRecordingRef.current = stopRecording;

  // Update parent when transcript changes
  useEffect(() => {
    onTranscriptChange?.(fullTranscript);
  }, [fullTranscript, onTranscriptChange]);

  // Update processed results for word cloud
  useEffect(() => {
    const results: ProcessedResult[] = [];
    chunks.forEach((chunk) => {
      if (chunk.status === 'completed' && chunk.words) {
        chunk.words.forEach((w) => {
          results.push({ word: w.word, weight: w.weight, source: 'llm' });
        });
      }
    });
    onProcessedResultsChange?.(results);
  }, [chunks, onProcessedResultsChange]);

  // Update progress
  useEffect(() => {
    const completed = chunks.filter((c) => c.status === 'completed').length;
    const processing = chunks.filter((c) => c.status === 'processing').length;
    const pending = chunks.filter((c) => c.status === 'pending').length;
    const failed = chunks.filter((c) => c.status === 'failed').length;
    onProgressUpdate?.({ completed, processing, pending, failed });
  }, [chunks, onProgressUpdate]);

  const resetRecording = useCallback(() => {
    setChunks([]);
    setElapsedTime(0);
    setWarnings([]);
    setStatus('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopKeepAlive();
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    };
  }, [stopKeepAlive]);

  // Format time
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const completedChunks = chunks.filter((c) => c.status === 'completed').length;
  const pendingChunks = chunks.filter((c) => c.status === 'pending').length;
  const failedChunks = chunks.filter((c) => c.status === 'failed').length;

  return (
    <div className="space-y-4">
      <Card className={status === 'recording' ? 'border-green-500 shadow-lg' : ''}>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            {/* Status Display */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {status === 'recording' ? (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                ) : status === 'requesting' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                ) : status === 'stopped' ? (
                  <MicOff className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Mic className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-lg font-medium">
                  {status === 'idle' && '等待开始'}
                  {status === 'requesting' && '正在请求权限...'}
                  {status === 'recording' && '会议进行中'}
                  {status === 'stopped' && '会议已结束'}
                </span>
              </div>

              {/* Timer */}
              <div className="text-3xl font-mono font-bold text-primary">
                {formatTime(elapsedTime)}
              </div>

              {/* Progress */}
              {status === 'recording' && (
                <div className="text-sm text-muted-foreground mt-2">
                  <div>片段: {completedChunks} 已完成 | {pendingChunks} 待处理 | {failedChunks} 失败</div>
                  {pendingChunks > 0 && (
                    <div className="text-xs text-orange-500 mt-1">
                      正在后台处理，请稍候...
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-yellow-700">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3 mt-4">
              {status === 'idle' && (
                <Button
                  size="lg"
                  onClick={startRecording}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  会议开始
                </Button>
              )}

              {status === 'recording' && (
                <Button
                  size="lg"
                  onClick={stopRecording}
                  variant="destructive"
                >
                  <Square className="mr-2 h-5 w-5" />
                  结束会议
                </Button>
              )}

              {status === 'stopped' && (
                <Button
                  size="lg"
                  onClick={resetRecording}
                  variant="outline"
                >
                  重新开始
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
