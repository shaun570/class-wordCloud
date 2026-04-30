import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2分钟超时

interface WordWeight {
  word: string;
  weight: number;
}

const SYSTEM_PROMPT = `你是一个专业的地理和教育领域文本分析助手。请分析以下会议录音文本，提取关键词并根据其重要性赋予权重。

分析要求：
1. 提取有意义的关键词（2-5个字）
2. 地理相关词汇（如：国家、城市、山脉、河流、气候、资源、人口、经济、文化等）权重 ×3
3. 教育相关词汇（如：学习、学生、老师、课程、知识、考试、教学等）权重 ×2.5
4. 专业术语和核心概念权重 ×2
5. 一般性词汇保持原权重 ×1
6. 无意义的虚词、口头禅等权重 ×0.1 或忽略（如：这个、那个、就是、那么、怎么、什么等）

请以JSON格式返回，格式如下：
{
  "words": [
    {"word": "关键词", "weight": 数字},
    ...
  ]
}

只返回JSON，不要有其他内容。`;

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

    // Extract forward headers from the request
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    // Initialize LLM client
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: text }
    ];

    // Call LLM API using invoke (non-streaming for structured JSON output)
    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-lite-260215',
      temperature: 0.3, // Lower temperature for more consistent JSON output
    });

    let words: WordWeight[] = [];

    if (response.content) {
      try {
        // Extract JSON from the response (handle potential markdown code blocks)
        let jsonStr = response.content;
        
        // Remove markdown code block markers if present
        jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        jsonStr = jsonStr.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        
        // Try to find JSON object in the content
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          words = parsed.words || [];
          console.log(`[LLM] 成功解析关键词，数量: ${words.length}`);
        } else {
          console.error('[LLM] 未找到JSON内容:', jsonStr.substring(0, 200));
        }
      } catch (parseError) {
        console.error('[LLM] 解析响应失败:', parseError, '原始内容:', response.content.substring(0, 500));
      }
    }

    // If LLM parsing failed, fall back to simple word analysis
    if (words.length === 0) {
      console.log('[LLM] LLM解析失败，使用fallback函数');
      words = simpleWordAnalysis(text);
    }

    return NextResponse.json({
      success: true,
      chunkId,
      words,
      textLength: text.length,
      usedFallback: words.length > 0 && !response.content,
    });
  } catch (error) {
    console.error('[LLM] 关键词分析错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    
    // Try fallback on error
    try {
      const body = await request.clone().json();
      const text = body?.text;
      if (text) {
        console.log('[LLM] API错误，使用fallback函数');
        const words = simpleWordAnalysis(text);
        return NextResponse.json({
          success: true,
          chunkId: body?.chunkId,
          words,
          textLength: text.length,
          usedFallback: true,
          error: errorMessage,
        });
      }
    } catch {}

    return NextResponse.json(
      { 
        error: '关键词分析失败',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

// Enhanced fallback simple word frequency analysis with better filtering
function simpleWordAnalysis(text: string): WordWeight[] {
  // Expanded stop words list (including filler words and meaningless phrases)
  const stopWords = new Set([
    // Common function words
    '的', '了', '和', '是', '就', '都', '而', '及', '与', '着', '或', '一个',
    '没有', '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '如何',
    '为什么', '可以', '要', '不要', '会', '不会', '能', '不能', '不是', '有',
    '没有', '在', '也', '很', '但', '但是', '因为', '所以', '如果', '虽然',
    '然后', '而且', '或者', '还是', '不过', '只是', '还', '已经', '正在',
    '现在', '这里', '那里', '自己', '别人', '大家', '你', '他', '她', '它',
    '们', '得', '地', '啊', '呀', '吧', '呢', '吗', '哦', '嗯', '哈', '嘿',
    '这个', '那个', '就是', '那么', '这么', '什么', '怎样',
    // Filler words
    '好的', '好的好的', '嗯嗯', '对对', '对对对', '好吧', '行', '行吧', '好的吧',
    'OK', 'ok', '好', '我看', '我觉得', '你知道', '就是', '然后呢', '后来',
    '这样', '那样', '怎么样', '干嘛', '干吗', '不干嘛', '没干嘛',
    '其实', '实际上', '基本上', '大概', '可能', '应该', '好像', '大概',
    '差不多', '一般来说', '通常', '一般', '有时候', '偶尔', '经常',
    '真的', '真的是', '老实说', '说实话', '说真的', '其实说实话',
    // Question words
    '谁', '哪儿', '哪里', '哪', '哪个', '哪些', '谁的', '多少', '几',
    // Demonstratives and pronouns
    '这些', '那些', '这种', '那种', '各位', '大伙', '咱们', '俺', '咱',
    // Time words that are too generic
    '今天', '明天', '昨天', '以前', '以前', '之后', '之前', '后来',
    '刚才', '刚才的', '马上', '立刻', '一下', '一会儿', '等一下',
    // Negations and common phrases
    '不用', '不必', '无需', '无须', '不必了', '不用了',
    '没错', '不错', '很好', '好的', '行', '可以', '好',
    // Verb particles
    '一下', '一下下', '一下子', '一点', '有点',
    // Sentence starters
    '那个那个', '呃呃', '呃', '嗯', '啊', '唉', '哎',
    // Numbers and measurement words (not useful alone)
    '一下', '一点', '一些', '各种', '各种各样',
    // Generic words
    '东西', '事情', '问题', '情况', '样子', '感觉',
  ]);

  // Geography-related words (higher weight)
  const geoWords = new Set([
    '中国', '世界', '亚洲', '欧洲', '美洲', '韧性城市', '窑洞', '木质', '材料', '抗震', 'AI', '地质灾害', 

    '山脉', '高原', '平原', '盆地', '丘陵', 
    '气候', '气温', '降水',
    '地形', '地貌', '地势', '海拔', '资源', '能源', '矿产', '石油', '天然气',
    '人口', '经济', '文化', '地理', '地图', '经度', '纬度', '赤道', '极地',
    '陆地', '岛屿', '半岛', '海峡', '海湾', '海岸', '港口', '首都',   '火山', '地震', '板块', '农业', '工业',
    '交通', '环境', '生态', '保护', '污染', '可持续发展',
   '山区', '沿海', '内陆', 
  ]);

  // Education-related words (medium-high weight)
  const eduWords = new Set([
    '学习', '老师', '教师', '教学', '课程', '课堂', '教室', '学校',
    '知识', '考试', '测验', '作业', '复习', '预习', '练习',  '教育',

    '技巧', '研究', '实验', '观察', '分析', '总结', '概念', '原理', '规律',
    '理论', '模型', '公式', '定律', '案例', '实践', '应用', '创新', '创造',
    '培养', '成长', '发展', '指导', '讲解', '示范', '提问', '回答', '讨论',
    '交流', '合作', '团队', '项目', '任务', '目标', '计划', '实施', '评估',
  ]);

  // Split text into words and filter
  const words = text
    .replace(/[，。！？、；：""''【】《》（）\s,\.!?;:'"()\[\]\{\}]/g, ' ')
    .split(/\s+/)
    .filter((word) => {
      // Filter out stop words
      if (stopWords.has(word)) return false;
      // Filter out words that are too short or too long
      if (word.length < 2 || word.length > 5) return false;
      // Filter out words with numbers or special characters
      if (/[0-9a-zA-Z]/.test(word)) return false;
      return true;
    });

  // Count frequency
  const countMap = new Map<string, number>();
  words.forEach((word) => {
    countMap.set(word, (countMap.get(word) || 0) + 1);
  });

  // Calculate weights with category boost
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
