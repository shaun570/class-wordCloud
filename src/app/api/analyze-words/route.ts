import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface WordWeight {
  word: string;
  weight: number;
}

interface ClassSummary {
  mainTopics: string[];
  teachingFlow: string;
  keyConceptsRepeated: string[];
  suggestions: string[];
}

// ─── 学科权重配置 ────────────────────────────────────────────
const SUBJECT_WEIGHT_KEYWORDS: Record<string, { high: string[]; medium: string[] }> = {
  geography: {
    high: ['地形', '气候', '河流', '山脉', '高原', '平原', '盆地', '经度', '纬度',
            '地震', '火山', '板块', '资源', '人口', '经济', '生态', '环境', '海拔',
            '气温', '降水', '季风', '洋流', '地貌', '沙漠', '草原', '森林', '湿地'],
    medium: ['学习', '教学', '课程', '知识', '概念', '原理', '分析', '总结', '地图'],
  },
  history: {
    high: ['朝代', '战争', '革命', '改革', '起义', '条约', '文明', '帝国', '封建',
            '殖民', '工业', '启蒙', '民主', '独立', '统一', '政治', '经济', '文化'],
    medium: ['历史', '时期', '事件', '人物', '影响', '背景', '原因', '意义', '评价'],
  },
  chinese: {
    high: ['诗歌', '散文', '小说', '戏剧', '修辞', '比喻', '拟人', '排比', '意象',
            '主旨', '情感', '作者', '文言', '白话', '韵律', '结构', '段落', '主题'],
    medium: ['阅读', '写作', '语言', '表达', '分析', '理解', '积累', '欣赏', '鉴赏'],
  },
  math: {
    high: ['函数', '方程', '不等式', '导数', '积分', '向量', '矩阵', '概率', '统计',
            '几何', '三角', '数列', '极限', '集合', '逻辑', '证明', '定理', '公式'],
    medium: ['计算', '推导', '解题', '思路', '方法', '规律', '变量', '参数', '坐标'],
  },
  english: {
    high: ['语法', '词汇', '听力', '阅读', '写作', '口语', '时态', '语态', '从句',
            '短语', '句型', '篇章', '语境', '表达', '交流', '翻译', '理解', '应用'],
    medium: ['单词', '发音', '练习', '背诵', '语言', '文化', '习惯', '技巧', '方法'],
  },
  physics: {
    high: ['力学', '热学', '电磁', '光学', '原子', '能量', '动量', '电场', '磁场',
            '电路', '波动', '振动', '折射', '反射', '加速度', '质量', '速度', '功率'],
    medium: ['实验', '测量', '公式', '定律', '原理', '推导', '计算', '分析', '模型'],
  },
  chemistry: {
    high: ['元素', '化合物', '反应', '氧化', '还原', '酸碱', '盐', '有机', '无机',
            '分子', '原子', '离子', '键合', '溶液', '浓度', '催化', '平衡', '电化学'],
    medium: ['实验', '方程式', '性质', '结构', '变化', '分析', '推断', '计算', '规律'],
  },
  biology: {
    high: ['细胞', '遗传', '进化', '生态', '蛋白质', 'DNA', '基因', '酶', '光合',
            '呼吸', '神经', '激素', '免疫', '种群', '群落', '生物链', '变异', '染色体'],
    medium: ['实验', '观察', '分析', '结构', '功能', '过程', '机制', '调节', '适应'],
  },
  general: {
    high: ['重点', '难点', '考点', '核心', '关键', '重要', '必须', '掌握', '理解'],
    medium: ['学习', '教学', '课程', '知识', '概念', '分析', '总结', '方法', '技巧'],
  },
};

// ─── System Prompt（词云分析） ────────────────────────────────
function buildWordPrompt(subject: string): string {
  const subjectNames: Record<string, string> = {
    geography: '地理', history: '历史', chinese: '语文',
    math: '数学', english: '英语', physics: '物理',
    chemistry: '化学', biology: '生物', general: '通用',
  };
  const subjectName = subjectNames[subject] || '通用';

  return `你是一位${subjectName}学科课堂分析专家（使用豆包大模型 doubao-seed-2-0-lite，字节跳动国产大模型）。
请分析以下课堂录音文本，提取关键词并根据重要性赋予权重。

分析要求：
1. 提取有意义的关键词（2-5个字）
2. ${subjectName}学科核心术语权重 ×3
3. 教学相关词汇（学习、掌握、理解、分析等）权重 ×2
4. 一般性词汇保持原权重 ×1
5. 无意义虚词、口头禅忽略（这个、那个、就是、然后等）

请严格以JSON格式返回，不要有其他内容：
{
  "words": [
    {"word": "关键词", "weight": 数字},
    ...
  ]
}`;
}

// ─── System Prompt（课堂摘要） ────────────────────────────────
function buildSummaryPrompt(subject: string): string {
  const subjectNames: Record<string, string> = {
    geography: '地理', history: '历史', chinese: '语文',
    math: '数学', english: '英语', physics: '物理',
    chemistry: '化学', biology: '生物', general: '通用',
  };
  const subjectName = subjectNames[subject] || '通用';

  return `你是一位专业的${subjectName}学科教学分析专家（使用豆包大模型 doubao-seed-2-0-lite，字节跳动国产大模型）。
请分析以下课堂录音文本，生成结构化的课堂分析报告。

请严格以JSON格式返回，不要有其他内容：
{
  "mainTopics": ["本节课知识点1", "知识点2", "知识点3"],
  "teachingFlow": "用2-3句话描述本节课的教学脉络",
  "keyConceptsRepeated": ["反复强调的概念1", "概念2"],
  "suggestions": ["教学建议1", "教学建议2"]
}

要求：
- mainTopics：3-5个核心知识点，每个不超过10字
- teachingFlow：100字以内，描述教学逻辑和进程
- keyConceptsRepeated：教师反复提及的重要概念，2-4个
- suggestions：基于课堂内容给出的改进建议，1-3条`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, chunkId, subject = 'general', generateSummary = false } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: '缺少文本内容' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // ── 步骤1：词云关键词分析 ──────────────────────────────────
    const wordMessages = [
      { role: 'system' as const, content: buildWordPrompt(subject) },
      { role: 'user' as const, content: text },
    ];

    const wordResponse = await client.invoke(wordMessages, {
      model: 'doubao-seed-2-0-lite-260215',
      temperature: 0.3,
    });

    let words: WordWeight[] = [];

    if (wordResponse.content) {
      try {
        let jsonStr = wordResponse.content
          .replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
          .replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          words = parsed.words || [];
        }
      } catch (e) {
        console.error('[LLM] 词云解析失败:', e);
      }
    }

    if (words.length === 0) {
      words = simpleWordAnalysis(text, subject);
    }

    // ── 步骤2：课堂摘要生成（仅当 generateSummary=true 且文本足够长时） ──
    let summary: ClassSummary | null = null;

    if (generateSummary && text.length > 20) {
      try {
        const summaryMessages = [
          { role: 'system' as const, content: buildSummaryPrompt(subject) },
          { role: 'user' as const, content: text },
        ];

        const summaryResponse = await client.invoke(summaryMessages, {
          model: 'doubao-seed-2-0-lite-260215',
          temperature: 0.5,
        });

        if (summaryResponse.content) {
          let jsonStr = summaryResponse.content
            .replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
            .replace(/^```\s*/i, '').replace(/\s*```$/i, '');
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            summary = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (e) {
        console.error('[LLM] 摘要生成失败:', e);
        // 摘要失败不影响词云返回
      }
    }

    return NextResponse.json({
      success: true,
      chunkId,
      words,
      summary,
      textLength: text.length,
      subject,
      usedFallback: false,
    });

  } catch (error) {
    console.error('[LLM] 分析错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';

    try {
      const body = await request.clone().json();
      const text = body?.text;
      if (text) {
        const words = simpleWordAnalysis(text, body?.subject || 'general');
        return NextResponse.json({
          success: true,
          chunkId: body?.chunkId,
          words,
          summary: null,
          textLength: text.length,
          usedFallback: true,
          error: errorMessage,
        });
      }
    } catch {}

    return NextResponse.json(
      { error: '关键词分析失败', details: errorMessage },
      { status: 500 }
    );
  }
}

// ─── Fallback 词频统计（支持学科权重） ───────────────────────
function simpleWordAnalysis(text: string, subject = 'general'): WordWeight[] {
  const stopWords = new Set([
    '的', '了', '和', '是', '就', '都', '而', '及', '与', '着', '或', '一个',
    '没有', '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '如何',
    '为什么', '可以', '要', '不要', '会', '不会', '能', '不能', '不是', '有',
    '在', '也', '很', '但', '但是', '因为', '所以', '如果', '虽然', '然后',
    '而且', '或者', '还是', '不过', '只是', '还', '已经', '正在', '现在',
    '这里', '那里', '自己', '别人', '大家', '你', '他', '她', '它', '们',
    '得', '地', '啊', '呀', '吧', '呢', '吗', '哦', '嗯', '哈', '嘿',
    '就是', '那么', '这么', '怎样', '好的', '对对', '其实', '实际上',
    '基本上', '大概', '可能', '应该', '好像', '差不多', '一般', '经常',
    '真的', '谁', '哪里', '哪', '哪个', '多少', '这些', '那些', '各位',
    '今天', '明天', '昨天', '以前', '之后', '之前', '后来', '刚才', '马上',
    '一下', '一会儿', '一点', '有点', '东西', '事情', '问题', '情况',
  ]);

  const subjectKeywords = SUBJECT_WEIGHT_KEYWORDS[subject] || SUBJECT_WEIGHT_KEYWORDS.general;

  const words = text
    .replace(/[，。！？、；：""''【】《》（）\s,\.!?;:'"()\[\]\{\}]/g, ' ')
    .split(/\s+/)
    .filter((word) => {
      if (stopWords.has(word)) return false;
      if (word.length < 2 || word.length > 5) return false;
      if (/[0-9a-zA-Z]/.test(word)) return false;
      return true;
    });

  const countMap = new Map<string, number>();
  words.forEach((word) => {
    countMap.set(word, (countMap.get(word) || 0) + 1);
  });

  const result: WordWeight[] = [];
  countMap.forEach((count, word) => {
    let weight = count;
    if (subjectKeywords.high.includes(word)) {
      weight = count * 3;
    } else if (subjectKeywords.medium.includes(word)) {
      weight = count * 2;
    }
    result.push({ word, weight });
  });

  return result.sort((a, b) => b.weight - a.weight).slice(0, 50);
}
