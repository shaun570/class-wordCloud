'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as echarts from 'echarts';
import 'echarts-wordcloud';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface ProcessedResult {
  word: string;
  weight: number;
  source?: 'llm' | 'fallback';
}

interface WordCloudProps {
  processedResults?: ProcessedResult[];
  onReset?: () => void;
  // 新增：供外部获取词云图片的回调
  onChartReady?: (getImageFn: () => string | null) => void;
}

const greenColors = [
  '#15803d', '#16a34a', '#22c55e',
  '#4ade80', '#86efac', '#bbf7d0', '#14532d',
];

interface WordData {
  name: string;
  value: number;
}

export function WordCloud({ processedResults = [], onReset, onChartReady }: WordCloudProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const wordData = useMemo<WordData[]>(() => {
    if (processedResults.length === 0) return [];
    const wordMap = new Map<string, number>();
    processedResults.forEach((result) => {
      const current = wordMap.get(result.word) || 0;
      wordMap.set(result.word, Math.max(current, result.weight));
    });
    return Array.from(wordMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 100);
  }, [processedResults]);

  // 暴露获取图片函数给父组件
  const getChartImage = useCallback((): string | null => {
    if (!chartInstanceRef.current) return null;
    return chartInstanceRef.current.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#ffffff',
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
          `${params.name}: ${params.value.toFixed(1)}`,
      },
      series: [
        {
          type: 'wordCloud',
          shape: 'ellipse',
          left: 'center',
          top: 'center',
          width: '90%',
          height: '90%',
          sizeRange: [14, 60],
          rotationRange: [-30, 30],
          rotationStep: 15,
          gridSize: 8,
          drawOutOfBound: false,
          textStyle: {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontWeight: 'bold',
            color: () => greenColors[Math.floor(Math.random() * greenColors.length)],
          },
          emphasis: {
            textStyle: { shadowBlur: 10, shadowColor: '#22c55e' },
          },
          data: wordData,
        },
      ],
    });

    // 图表渲染完成后通知父组件
    chart.on('finished', () => {
      onChartReady?.(getChartImage);
    });

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [wordData, onChartReady, getChartImage]);

  // 下载词云图片
  const handleDownload = () => {
    const dataURL = getChartImage();
    if (!dataURL) return;
    const link = document.createElement('a');
    link.download = `词云-${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.png`;
    link.href = dataURL;
    link.click();
  };

  if (wordData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">词云分析</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
          <p className="text-muted-foreground">暂无词云数据</p>
          <p className="text-sm text-muted-foreground mt-2">请先开始录音并录制内容</p>
          {onReset && (
            <Button variant="outline" onClick={onReset} className="mt-4">重新开始</Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">词云分析</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              下载词云图
            </Button>
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset}>重新开始</Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">共提取 {wordData.length} 个关键词</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div ref={chartRef} className="w-full" style={{ height: '400px' }} />
      </CardContent>
    </Card>
  );
}
