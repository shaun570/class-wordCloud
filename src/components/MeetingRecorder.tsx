'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';

interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

interface MeetingRecorderProps {
  onTranscriptChange?: (fullTranscript: string) => void;
  onAutoStop?: () => void;
}

type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopped';

export function MeetingRecorder({ onTranscriptChange, onAutoStop }: MeetingRecorderProps) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSilent, setIsSilent] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  // Refs for callbacks to avoid circular dependency
  const stopListeningRef = useRef<(() => void) | null>(null);
  const autoStopCallbackRef = useRef(onAutoStop);
  const stopRecordingFnRef = useRef<(() => void) | null>(null);

  const fullTranscript = segments.map((s) => s.text).join('');

  const { isSupported, startListening, stopListening, resetTranscript } =
    useSpeechRecognition({
      language: 'zh-CN',
      continuous: true,
      onResult: (text, isFinal) => {
        if (isFinal && text.trim()) {
          setSegments((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random()}`,
              text: text,
              timestamp: Date.now(),
            },
          ]);
        }
      },
    });

  // Keep refs updated
  useEffect(() => {
    stopListeningRef.current = stopListening;
    autoStopCallbackRef.current = onAutoStop;
  }, [stopListening, onAutoStop]);

  // Update parent when transcript changes
  useEffect(() => {
    onTranscriptChange?.(fullTranscript);
  }, [fullTranscript, onTranscriptChange]);

  // Stop recording function - stored in ref for recursive access
  const stopRecording = useCallback(() => {
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop speech recognition
    if (stopListeningRef.current) {
      stopListeningRef.current();
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setStatus('stopped');
    setAudioLevel(0);
    setIsSilent(false);
    setSilenceDuration(0);
  }, []);

  // Keep stopRecording ref updated
  useEffect(() => {
    stopRecordingFnRef.current = stopRecording;
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    try {
      setStatus('requesting');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      mediaStreamRef.current = stream;

      // Create audio context for visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.start(1000);
      setStatus('recording');

      // Start timer
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);

      // Start speech recognition
      startListening();

      // Audio level monitoring using recursive animation frame
      const monitorAudio = () => {
        if (!analyserRef.current || status !== 'recording') return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const energy = Math.sqrt(sum / dataArray.length);

        setAudioLevel(Math.min(energy * 5, 100));
        setIsSilent(energy < 0.02);

        if (energy < 0.02) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          }
          const duration = Date.now() - silenceStartRef.current;
          setSilenceDuration(duration);

          // 30 minutes = 1800000ms
          if (duration >= 1800000) {
            if (stopRecordingFnRef.current) {
              stopRecordingFnRef.current();
            }
            if (autoStopCallbackRef.current) {
              autoStopCallbackRef.current();
            }
            return; // Stop monitoring
          }
        } else {
          silenceStartRef.current = null;
          setSilenceDuration(0);
        }

        animationFrameRef.current = requestAnimationFrame(monitorAudio);
      };

      animationFrameRef.current = requestAnimationFrame(monitorAudio);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('idle');
    }
  }, [startListening, status]);

  const resetRecording = useCallback(() => {
    setSegments([]);
    setElapsedTime(0);
    resetTranscript();
    setStatus('idle');
  }, [resetTranscript]);

  // Format time as HH:MM:SS
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate remaining silence time before auto-stop
  const remainingSilence = Math.max(0, 30 * 60 * 1000 - silenceDuration);

  if (!isSupported) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6 text-center">
          <p className="text-destructive">您的浏览器不支持语音识别功能</p>
          <p className="text-sm text-muted-foreground mt-2">
            请使用 Chrome、Safari 或 Edge 浏览器
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <Card className={status === 'recording' ? 'border-green-500 shadow-lg' : ''}>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            {/* Audio Level Indicator */}
            {status === 'recording' && (
              <div className="flex items-center gap-2 w-full max-w-xs">
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-100"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
                {isSilent && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    静默 {Math.floor(remainingSilence / 60000)}分钟
                  </span>
                )}
              </div>
            )}

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

              {/* Word Count */}
              <div className="text-sm text-muted-foreground mt-2">
                已识别文字：{fullTranscript.length} 字
              </div>
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
