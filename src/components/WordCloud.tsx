'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as echarts from 'echarts';
import 'echarts-wordcloud';
import { Download, RotateCcw } from 'lucide-react';

interface ProcessedResult {
  word: string;
  weight: number;
  source?: 'llm' | 'fallback';
}

interface WordCloudProps {
  processedResults?: ProcessedResult[];
  onReset?: () => void;
  onChartReady?: (getImageFn: () => string | null) => void;
}

// 教育蓝色系配色
const blueColors = [
  '#1d4ed8', '#2563eb', '#3b82f6',
  '#60a5fa', '#93c5fd', '#1e40af',
  '#1447e6', '#0ea5e9', '#0284c7',
];

interface WordData { name: string; value: number; }

export function WordCloud({ processedResults = [], onReset, onChartReady }: WordCloudProps) {
  const chartRef         = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const wordData = useMemo<WordData[]>(() => {
    if (processedResults.length === 0) return [];
    const wordMap = new Map<string, number>();
    processedResults.forEach(({ word, weight }) => {
      wordMap.set(word, Math.max(wordMap.get(word) || 0, weight));
    });
    return Array.from(wordMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 100);
  }, [processedResults]);

  const getChartImage = useCallback((): string | null => {
    if (!chartInstanceRef.current) return null;
    return chartInstanceRef.current.getDataURL({
      type: 'png', pixelRatio: 2, backgroundColor: '#ffffff',
    });
  }, []);

  useEffect(() => {
    if (!chartRef.current || wordData.length === 0) return;

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    chart.setOption({
      backgroundColor: '#ffffff',
      tooltip: {
        show: true,
        formatter: (params: { name: string; value: number }) =>
          `<span style="font-size:13px;color:#1d4ed8;font-weight:600">${params.name}</span>
           <span style="color:#6b7280;margin-left:6px">${params.value.toFixed(1)}</span>`,
      },
      series: [{
        type: 'wordCloud',
        shape: 'ellipse',
        left: 'center',
        top: 'center',
        width: '90%',
        height: '90%',
        sizeRange: [14, 60],
        rotationRange: [-20, 20],
        rotationStep: 10,
        gridSize: 8,
        drawOutOfBound: false,
        textStyle: {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontWeight: 'bold',
          color: () => blueColors[Math.floor(Math.random() * blueColors.length)],
        },
        emphasis: {
          textStyle: { shadowBlur: 8, shadowColor: 'rgba(59,130,246,0.4)' },
        },
        data: wordData,
      }],
    });

    chart.on('finished', () => onChartReady?.(getChartImage));

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [wordData, onChartReady, getChartImage]);

  const handleDownload = () => {
    const dataURL = getChartImage();
    if (!dataURL) return;
    const link     = document.createElement('a');
    link.download  = `词云-${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.png`;
    link.href      = dataURL;
    link.click();
  };

  // ── 空态 ───────────────────────────────────────────────────
  if (wordData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center min-h-[320px] p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium text-sm mb-1">暂无词云数据</p>
        <p className="text-xs text-gray-400">请先开始录音并录制课堂内容</p>
        {onReset && (
          <button
            onClick={onReset}
            className="mt-5 flex items-center gap-1.5 px-4 py-2 border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重新开始
          </button>
        )}
      </div>
    );
  }

  // ── 正常态 ─────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">

      {/* 标题栏 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
        <div>
          <span className="text-sm font-semibold text-gray-700">词云分析</span>
          <span className="ml-2 text-xs text-gray-400">共 {wordData.length} 个关键词</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            下载图片
          </button>
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新开始
            </button>
          )}
        </div>
      </div>

      {/* 词云图 */}
      <div className="flex-1 p-4 min-h-0">
        <div ref={chartRef} className="w-full h-full" style={{ minHeight: '360px' }} />
      </div>
    </div>
  );
}
