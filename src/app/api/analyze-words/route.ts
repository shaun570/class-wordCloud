import { NextRequest, NextResponse } from 'next/server';
import { Config } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1分钟超时

interface WordWeight {
  word: string;
  weight: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, chunkId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '缺少文本内容' },
        { status: 400 }
      );
    }

    // Call LLM to analyze word weights
    const config = new Config();
    
    // Use fetch to call the LLM API directly
    const llmResponse = await fetch(`${process.env.COZE_API_BASE_URL || 'https://api.coze.cn'}/v3/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.COZE_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'doubao-seed-2.0-lite-260215',
        messages: [
          {
            role: 'system',
            content: `你是一个专业的地理和教育领域文本分析助手。请分析以下会议录音文本，提取关键词并根据其重要性赋予权重。

分析要求：
1. 提取有意义的关键词（2-5个字）
2. 地理相关词汇（如：国家、城市、山脉、河流、气候、资源、人口、经济、文化等）权重 ×3
3. 教育相关词汇（如：学习、学生、老师、课程、知识、考试、教学等）权重 ×2.5
4. 专业术语和核心概念权重 ×2
5. 一般性词汇保持原权重 ×1
6. 无意义的虚词、口头禅等权重 ×0.1 或忽略

请以JSON格式返回，格式如下：
{
  "words": [
    {"word": "关键词", "weight": 数字},
    ...
  ]
}

只返回JSON，不要有其他内容。`
          },
          {
            role: 'user',
            content: text
          }
        ],
        stream: false,
      }),
    });

    if (!llmResponse.ok) {
      throw new Error(`LLM API error: ${llmResponse.status}`);
    }

    const llmData = await llmResponse.json();
    const assistantMessage = llmData.messages?.find((m: { role: string }) => m.role === 'assistant');
    let words: WordWeight[] = [];

    if (assistantMessage?.content) {
      try {
        // Extract JSON from the response
        const jsonMatch = assistantMessage.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          words = parsed.words || [];
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
      }
    }

    // If LLM parsing failed, fall back to simple word frequency
    if (words.length === 0) {
      words = simpleWordAnalysis(text);
    }

    return NextResponse.json({
      success: true,
      chunkId,
      words,
      textLength: text.length,
    });
  } catch (error) {
    console.error('Word analysis error:', error);
    return NextResponse.json(
      { 
        error: '关键词分析失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}

// Fallback simple word frequency analysis
function simpleWordAnalysis(text: string): WordWeight[] {
  // Stop words to filter out
  const stopWords = new Set([
    '的', '了', '和', '是', '就', '都', '而', '及', '与', '着', '或', '一个',
    '没有', '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '如何',
    '为什么', '可以', '要', '不要', '会', '不会', '能', '不能', '不是', '有',
    '没有', '在', '也', '很', '但', '但是', '因为', '所以', '如果', '虽然',
    '然后', '而且', '或者', '还是', '不过', '只是', '还', '已经', '正在',
    '现在', '这里', '那里', '自己', '别人', '大家', '你', '他', '她', '它',
    '们', '得', '地', '啊', '呀', '吧', '呢', '吗', '哦', '嗯', '哈', '嘿',
    '这个', '那个', '就是', '那么', '这么', '什么', '怎样',
  ]);

  // Geography-related words (higher weight)
  const geoWords = new Set([
    '中国', '世界', '亚洲', '欧洲', '美洲', '非洲', '大洋洲', '国家', '省份',
    '城市', '河流', '山脉', '海洋', '气候', '地形', '资源', '人口', '经济',
    '文化', '地理', '地图', '经度', '纬度', '赤道', '极地', '热带', '温带',
    '寒带', '陆地', '岛屿', '高原', '平原', '盆地', '沙漠', '森林', '草原',
    '海岸', '港口', '首都', '地区', '边界', '领土', '大陆', '半岛', '海峡',
    '湖泊', '瀑布', '火山', '地震', '板块', '矿产', '农业', '工业', '交通',
  ]);

  // Education-related words (medium-high weight)
  const eduWords = new Set([
    '学习', '学生', '老师', '教学', '课程', '课堂', '知识', '考试', '作业',
    '学校', '大学', '小学', '中学', '教育', '教材', '课本', '笔记', '阅读',
    '理解', '掌握', '练习', '复习', '预习', '提问', '回答', '讨论', '讲解',
    '示范', '指导', '培养', '成长', '能力', '技能', '方法', '技巧', '研究',
    '实验', '观察', '分析', '总结', '概念', '原理', '规律', '理论', '模型',
  ]);

  // Split text into words
  const words = text
    .replace(/[，。！？、；：""''【】《》（）\s,\.!?;:'"()\[\]\{\}]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2 && word.length <= 5 && !stopWords.has(word));

  // Count frequency
  const countMap = new Map<string, number>();
  words.forEach((word) => {
    countMap.set(word, (countMap.get(word) || 0) + 1);
  });

  // Calculate weights
  const result: WordWeight[] = [];
  countMap.forEach((count, word) => {
    let weight = count;
    if (geoWords.has(word)) {
      weight = count * 3;
    } else if (eduWords.has(word)) {
      weight = count * 2.5;
    }
    result.push({ word, weight });
  });

  // Sort by weight descending
  result.sort((a, b) => b.weight - a.weight);

  return result.slice(0, 50);
}
