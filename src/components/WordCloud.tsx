'use client';

import { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import 'echarts-wordcloud';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface WordCloudProps {
  transcript: string;
  onReset?: () => void;
}

// Common Chinese stop words and sensitive words to filter out
const STOP_WORDS = new Set([
  // 常用虚词
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '着',
  '或', '一个', '没有', '我们', '你们', '他们', '这个', '那个',
  '什么', '怎么', '如何', '为什么', '可以', '要', '不要', '会',
  '不会', '能', '不能', '不是', '有', '没有',
  '在', '不在', '也', '很', '但', '但是', '因为', '所以',
  '如果', '虽然', '然后', '而且', '或者', '还是', '不过', '只是',
  '还', '已经', '正在', '将', '将要', '刚刚', '刚才',
  '现在', '目前', '今天', '明天', '昨天', '这里', '那里', '哪里',
  '这些', '那些', '自己', '别人', '大家',
  '你', '他', '她', '它', '们', '得', '地', '啊', '呀',
  '吧', '呢', '吗', '哦', '嗯', '哈', '嘿', '喂', '哎',
  '对', '不对', '是的', '好的', '行', '当然',
  '其实', '大概', '可能', '应该', '必须', '需要', '想要', '觉得',
  '知道', '不知道', '明白', '不懂', '请', '谢谢', '不用谢', '对不起',
  '没关系', '不用', '不用了',
  '嗯嗯', '对对', '是是', '好好', '知道知道',
  // 常见口语和无意义词
  '那个', '这个', '就是', '其实', '然后', '所以', '因为',
  '但是', '而且', '不过', '还是', '或者', '虽然', '如果',
  '那么', '这么', '多么', '什么', '怎样', '怎么样',
  '干嘛', '干吗', '为什么', '怎么', '怎样',
  // 脏话和敏感词
  '傻逼', '傻B', 'SB', 'sb', '傻比', '智障', '脑残',
  '废物', '垃圾', '变态', '神经病', '有病', '混蛋', '王八',
  '滚蛋', '闭嘴', '去死', '该死的', '他妈的', '妈的',
  '尼玛', '你妈', '他妈', '我操', '操你', '卧槽',
  '妈的', '妈逼', '妈B', '鸡巴', '牛逼', '牛B',
  '装逼', '装B', '逗逼', '逗B', '傻逼',
]);

interface WordCount {
  name: string;
  value: number;
}

// Green color palette for word cloud
const greenColors = [
  '#15803d', // dark green
  '#16a34a', // darker green
  '#22c55e', // green
  '#4ade80', // light green
  '#86efac', // lighter green
  '#bbf7d0', // lightest green
  '#14532d', // darkest green
];

export function WordCloud({ transcript, onReset }: WordCloudProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Process transcript into word counts
  const wordCounts = useMemo<WordCount[]>(() => {
    if (!transcript || transcript.length < 10) return [];

    // Split into words and count
    const words = transcript
      // Remove punctuation and split
      .replace(/[，。！？、；：""''【】《》（）\s,\.!?;:'"()\[\]\{\}]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 2 && word.length <= 5 && !STOP_WORDS.has(word));

    // Count frequency
    const countMap = new Map<string, number>();
    words.forEach((word) => {
      countMap.set(word, (countMap.get(word) || 0) + 1);
    });

    // Convert to array and sort by frequency
    const result = Array.from(countMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 100); // Top 100 words

    return result;
  }, [transcript]);

  useEffect(() => {
    if (!chartRef.current || wordCounts.length === 0) return;

    // Initialize chart
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    // Configure word cloud
    chart.setOption({
      backgroundColor: '#ffffff',
      tooltip: {
        show: true,
        formatter: (params: { name: string; value: number }) => {
          return `${params.name}: ${params.value}次`;
        },
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
            color: () => {
              return greenColors[Math.floor(Math.random() * greenColors.length)];
            },
          },
          emphasis: {
            textStyle: {
              shadowBlur: 10,
              shadowColor: '#22c55e',
            },
          },
          data: wordCounts,
        },
      ],
    });

    // Handle resize
    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [wordCounts]);

  // Download word cloud as image
  const handleDownload = () => {
    if (chartInstanceRef.current) {
      const dataURL = chartInstanceRef.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      const link = document.createElement('a');
      link.download = `wordcloud-${Date.now()}.png`;
      link.href = dataURL;
      link.click();
    }
  };

  if (wordCounts.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">词云分析</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
          <p className="text-muted-foreground">
            暂无词云数据
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            请先开始会议并录制内容
          </p>
          {onReset && (
            <Button variant="outline" onClick={onReset} className="mt-4">
              重新开始
            </Button>
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              下载
            </Button>
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset}>
                重新开始
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          共提取 {wordCounts.length} 个关键词
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          ref={chartRef}
          className="w-full"
          style={{ height: '400px' }}
        />
      </CardContent>
    </Card>
  );
}
