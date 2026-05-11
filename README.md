# 课堂智析助手

跨平台课堂录音分析 Web 应用，支持电脑、手机、平板。

## 功能

- **录音转词云 + 课堂分析**：课堂录音 → 实时转文字 → 生成带权重词云 + AI课堂分析报告
- **粘贴文稿转词云**：粘贴课堂文稿 → 生成词云 + AI课堂分析报告
- **9大学科支持**：地理、历史、语文、数学、英语、物理、化学、生物、通用
- **学科感知权重**：不同学科使用不同的关键词权重配置
- **AI课堂分析报告**：主要话题、教学脉络、反复强调的概念、教学建议
- **流水线处理**：每 3 分钟自动分割音频，后台并行 ASR + LLM 处理
- **词云例图**：录音结束后可查看词云例图参考

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
coze dev
```

启动后，在浏览器中打开 [http://localhost:5000](http://localhost:5000) 查看应用。

### 构建生产版本

```bash
coze build
```

### 启动生产服务器

```bash
coze start
```

## 技术栈

| 技术 | 说明 |
|------|------|
| Next.js 16 | App Router 全栈框架 |
| React 19 | UI 核心 |
| TypeScript 5 | 类型安全 |
| shadcn/ui + Tailwind CSS | 组件库与样式 |
| coze-coding-dev-sdk | ASR / LLM / 对象存储 |
| echarts-wordcloud | 词云渲染 |

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 主页面
│   ├── layout.tsx            # 布局组件
│   └── api/
│       ├── transcribe/       # ASR 转写 API
│       └── analyze-words/    # LLM 权重分析 + 课堂摘要 API
├── components/
│   ├── MeetingRecorder.tsx   # 录音组件
│   ├── TranscriptView.tsx    # 转写预览组件
│   └── WordCloud.tsx         # 词云组件
└── hooks/
    ├── useSilenceDetection.ts
    └── use-mobile.ts
```
