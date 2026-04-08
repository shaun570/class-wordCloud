'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSilenceDetectionProps {
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  onSilenceDetected?: () => void;
  silenceThreshold?: number;
  maxSilenceDuration?: number;
}

interface UseSilenceDetectionReturn {
  isSilent: boolean;
  silenceDuration: number;
  audioEnergy: number;
  resetSilence: () => void;
}

export function useSilenceDetection({
  audioContext,
  mediaStream,
  onSilenceDetected,
  silenceThreshold = 0.02,
  maxSilenceDuration = 30 * 60 * 1000, // 30 minutes
}: UseSilenceDetectionProps): UseSilenceDetectionReturn {
  const [isSilent, setIsSilent] = useState(true);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [audioEnergy, setAudioEnergy] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  const calculateEnergy = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  const resetSilence = useCallback(() => {
    silenceStartRef.current = null;
    setSilenceDuration(0);
  }, []);

  useEffect(() => {
    if (!audioContext || !mediaStream) return;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkAudio = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const energy = calculateEnergy(dataArray);
      setAudioEnergy(energy);

      const silent = energy < silenceThreshold;
      setIsSilent(silent);

      if (silent) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = Date.now();
        }
        const duration = Date.now() - silenceStartRef.current;
        setSilenceDuration(duration);

        if (duration >= maxSilenceDuration && onSilenceDetected) {
          onSilenceDetected();
        }
      } else {
        silenceStartRef.current = null;
        setSilenceDuration(0);
      }

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      source.disconnect();
    };
  }, [audioContext, mediaStream, silenceThreshold, maxSilenceDuration, onSilenceDetected, calculateEnergy]);

  return { isSilent, silenceDuration, audioEnergy, resetSilence };
}
