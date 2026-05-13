'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Square, Loader2, AlertCircle } from 'lucide-react';

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
  subject?: string;
  onTranscriptChange?: (fullTranscript: string) => void;
  onProcessedResultsChange?: (results: ProcessedResult[]) => void;
  onAutoStop?: () => void;
  onProgressUpdate?: (progress: {
    completed: number;
    processing: number;
    pending: number;
    failed: number;
  }) => void;
  onRecordingStopped?: () => void;
  onRecordingStart?: () => void;
}

type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopped';

const CHUNK_DURATION_MS = 3 * 60 * 1000;
const MAX_RECORDING_MS  = 2 * 60 * 60 * 1000;

export function MeetingRecorder({
  subject = 'general',
  onTranscriptChange,
  onProcessedResultsChange,
  onAutoStop,
  onProgressUpdate,
  onRecordingStopped,
  onRecordingStart,
}: MeetingRecorderProps) {
  const [status, setStatus]           = useState<RecordingStatus>('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [chunks, setChunks]           = useState<AudioChunk[]>([]);
  const [warnings, setWarnings]       = useState<string[]>([]);

  const mediaStreamRef      = useRef<MediaStream | null>(null);
  const mediaRecorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef       = useRef<Set<number>>(new Set());
  const chunkIdCounterRef   = useRef(0);
  const stopRecordingRef    = useRef<() => void>(() => {});

  const fullTranscript = chunks
    .filter((c) => c.status === 'completed' && c.transcript)
    .map((c) => c.transcript!)
    .join('');

  // ── Keep alive ───────────────────────────────────────────────
  const startKeepAlive = useCallback(() => {
    const audioContext = new AudioContext();
    const bufferSize   = audioContext.sampleRate * 1;
    const silentBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output       = silentBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = 0;

    const play = () => {
      if (!audioContext || audioContext.state === 'closed') return;
      try {
        const src = audioContext.createBufferSource();
        src.buffer = silentBuffer;
        src.connect(audioContext.destination);
        src.start();
      } catch { /* ignore */ }
    };

    play();
    keepAliveIntervalRef.current = setInterval(play, 2000);
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  }, []);

  // ── Process chunk ────────────────────────────────────────────
  const processChunk = useCallback(async (chunk: AudioChunk) => {
    if (processingRef.current.has(chunk.id)) return;
    processingRef.current.add(chunk.id);

    try {
      const mimeType  = chunk.blob.type;
      let extension   = 'ogg';
      if (mimeType.includes('mp4') || mimeType.includes('m4a')) extension = 'm4a';
      else if (mimeType.includes('webm')) extension = 'webm';
      else if (mimeType.includes('wav'))  extension = 'wav';

      const formData = new FormData();
      formData.append('audio',   chunk.blob, `chunk-${chunk.id}.${extension}`);
      formData.append('chunkId', String(chunk.id));

      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!transcribeRes.ok) throw new Error('Transcription failed');

      const { text: transcript, isSilent } = await transcribeRes.json();
      console.log(`[Chunk ${chunk.id}] isSilent=${isSilent}, len=${transcript?.length}, text="${transcript?.slice(0, 50)}"`);

      if (isSilent) {
        setChunks((prev) =>
          prev.map((c) => c.id === chunk.id ? { ...c, status: 'completed', transcript: '' } : c)
        );
        processingRef.current.delete(chunk.id);
        return;
      }

      const analyzeRes = await fetch('/api/analyze-words', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: transcript, chunkId: chunk.id, subject }),
      });
      if (!analyzeRes.ok) throw new Error('Word analysis failed');

      const { words } = await analyzeRes.json();
      setChunks((prev) =>
        prev.map((c) => c.id === chunk.id ? { ...c, status: 'completed', transcript, words } : c)
      );
    } catch (error) {
      console.error(`Chunk ${chunk.id} failed:`, error);
      if ((chunk.retryCount || 0) < 1) {
        setChunks((prev) =>
          prev.map((c) => c.id === chunk.id
            ? { ...c, status: 'pending', retryCount: (c.retryCount || 0) + 1 }
            : c)
        );
        setTimeout(() => processChunk({ ...chunk, retryCount: (chunk.retryCount || 0) + 1 }), 2000);
      } else {
        setChunks((prev) =>
          prev.map((c) => c.id === chunk.id ? { ...c, status: 'failed' } : c)
        );
        setWarnings((prev) => [...prev, `片段 ${chunk.id} 处理失败，已跳过`]);
      }
    } finally {
      processingRef.current.delete(chunk.id);
    }
  }, [subject]);

  // ── Chunk rotation ───────────────────────────────────────────
  const startNewChunk = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (chunksRef.current.length === 0) return;

    recorder.stop();
    recorder.onstop = () => {
      if (chunksRef.current.length > 0) {
        const chunkId   = chunkIdCounterRef.current++;
        const mimeType  = recorder.mimeType || 'audio/ogg';
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });

        setChunks((prev) => [...prev, { id: chunkId, blob: audioBlob, status: 'pending' }]);
        setTimeout(() => processChunk({ id: chunkId, blob: audioBlob, status: 'pending' }), 100);
        chunksRef.current = [];
      }

      if (mediaRecorderRef.current && mediaStreamRef.current) {
        try { mediaRecorderRef.current.start(1000); }
        catch (e) { console.error('[Recorder] restart failed:', e); }
      }
    };
  }, [processChunk]);

  // ── Start recording ──────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setStatus('requesting');
      setChunks([]);
      setWarnings([]);
      chunkIdCounterRef.current = 0;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 16000 },
      });
      mediaStreamRef.current = stream;

      let mimeType = 'audio/ogg;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm;codecs=opus';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setStatus('recording');
      onRecordingStart?.();

      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_MS / 1000) { stopRecordingRef.current(); onAutoStop?.(); }
          return next;
        });
      }, 1000);

      chunkTimerRef.current = setInterval(startNewChunk, CHUNK_DURATION_MS);
      startKeepAlive();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('idle');
    }
  }, [onAutoStop, startKeepAlive, startNewChunk, onRecordingStart]);

  // ── Stop recording ───────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    const cleanup = () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      if (timerRef.current)      { clearInterval(timerRef.current);      timerRef.current = null; }
      if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
      stopKeepAlive();
      setStatus('stopped');
      onRecordingStopped?.();
    };

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const chunkId   = chunkIdCounterRef.current++;
          const mimeType  = recorder.mimeType || 'audio/ogg';
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          setChunks((prev) => [...prev, { id: chunkId, blob: audioBlob, status: 'pending' }]);
          processChunk({ id: chunkId, blob: audioBlob, status: 'pending' });
          chunksRef.current = [];
        }
        cleanup();
      };
      recorder.stop();
    } else {
      cleanup();
    }
  }, [processChunk, stopKeepAlive, onRecordingStopped]);

  stopRecordingRef.current = stopRecording;

  // ── Effects ──────────────────────────────────────────────────
  useEffect(() => { onTranscriptChange?.(fullTranscript); }, [fullTranscript, onTranscriptChange]);

  useEffect(() => {
    const results: ProcessedResult[] = [];
    chunks.forEach((chunk) => {
      if (chunk.status === 'completed' && chunk.words) {
        chunk.words.forEach((w) => results.push({ word: w.word, weight: w.weight, source: 'llm' }));
      }
    });
    onProcessedResultsChange?.(results);
  }, [chunks, onProcessedResultsChange]);

  useEffect(() => {
    const completed  = chunks.filter((c) => c.status === 'completed').length;
    const processing = chunks.filter((c) => c.status === 'processing').length;
    const pending    = chunks.filter((c) => c.status === 'pending').length;
    const failed     = chunks.filter((c) => c.status === 'failed').length;
    onProgressUpdate?.({ completed, processing, pending, failed });
  }, [chunks, onProgressUpdate]);

  useEffect(() => {
    return () => {
      stopKeepAlive();
      if (timerRef.current)      clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    };
  }, [stopKeepAlive]);

  const resetRecording = useCallback(() => {
    setChunks([]);
    setElapsedTime(0);
    setWarnings([]);
    setStatus('idle');
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const completedChunks = chunks.filter((c) => c.status === 'completed').length;
  const pendingChunks   = chunks.filter((c) => c.status === 'pending').length;
  const failedChunks    = chunks.filter((c) => c.status === 'failed').length;

  // ── 状态配置 ─────────────────────────────────────────────────
  const isRecording = status === 'recording';

  return (
    <div
      className={[
        'bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-300',
        isRecording ? 'border-blue-400 shadow-blue-100 shadow-md' : 'border-gray-200',
      ].join(' ')}
    >
      {/* 顶部色条 */}
      <div
        className={[
          'h-1 w-full transition-all duration-500',
          isRecording
            ? 'bg-gradient-to-r from-blue-500 to-sky-400'
            : status === 'stopped'
            ? 'bg-gray-200'
            : 'bg-blue-100',
        ].join(' ')}
      />

      <div className="px-6 py-6 flex flex-col items-center gap-5">

        {/* 状态标签 */}
        <div className="flex items-center gap-2">
          {status === 'recording' && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
            </span>
          )}
          {status === 'requesting' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          {status === 'stopped'    && <MicOff className="h-4 w-4 text-gray-400" />}
          {status === 'idle'       && <Mic className="h-4 w-4 text-gray-400" />}

          <span className={[
            'text-sm font-medium',
            isRecording     ? 'text-blue-600' :
            status==='stopped' ? 'text-gray-500' : 'text-gray-500',
          ].join(' ')}>
            {status === 'idle'       && '等待开始'}
            {status === 'requesting' && '正在请求麦克风权限...'}
            {status === 'recording'  && '录音进行中'}
            {status === 'stopped'    && '录音已结束'}
          </span>
        </div>

        {/* 计时器 */}
        <div className={[
          'text-5xl font-mono font-bold tracking-widest tabular-nums transition-colors',
          isRecording ? 'text-blue-600' : 'text-gray-300',
        ].join(' ')}>
          {formatTime(elapsedTime)}
        </div>

        {/* 录音中进度提示 */}
        {isRecording && (chunks.length > 0) && (
          <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2 w-full justify-center">
            <span className="text-blue-600 font-medium">已完成 {completedChunks} 片段</span>
            {pendingChunks > 0 && <span className="text-amber-500">处理中 {pendingChunks} 片段</span>}
            {failedChunks  > 0 && <span className="text-red-400">失败 {failedChunks} 片段</span>}
          </div>
        )}

        {/* 警告 */}
        {warnings.length > 0 && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 w-full justify-center">
          {status === 'idle' && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all text-sm"
            >
              <Mic className="h-4 w-4" />
              开始录音
            </button>
          )}

          {status === 'requesting' && (
            <button
              disabled
              className="flex items-center gap-2 px-8 py-3 bg-blue-100 text-blue-400 font-semibold rounded-lg text-sm cursor-not-allowed"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              正在获取权限...
            </button>
          )}

          {status === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all text-sm"
            >
              <Square className="h-4 w-4" />
              结束录音
            </button>
          )}

          {status === 'stopped' && (
            <button
              onClick={resetRecording}
              className="flex items-center gap-2 px-8 py-3 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-lg text-sm transition-all"
            >
              <Mic className="h-4 w-4" />
              重新录音
            </button>
          )}
        </div>

        {/* 提示文字 */}
        {status === 'idle' && (
          <p className="text-xs text-gray-400 text-center">
            点击开始录音，系统将自动转写课堂语音并提取关键词
          </p>
        )}
        {status === 'recording' && (
          <p className="text-xs text-gray-400 text-center">
            录音每 3 分钟自动分段处理，最长支持 2 小时
          </p>
        )}
      </div>
    </div>
  );
}
