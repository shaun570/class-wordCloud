# 会议助手

跨平台会议录音转词云 Web 应用，支持电脑、手机、平板。

## 功能

- **录音转词云**：会议录音 → 实时转文字 → 生成带权重词云
- **粘贴文稿转词云**：粘贴会议记录文稿 → 生成词云
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
│   ├── globals.css           # 全局样式（绿色主题）
│   └── api/
│       ├── transcribe/       # ASR 转写 API
│       └── analyze-words/    # LLM 权重分析 API
├── components/
│   ├── MeetingRecorder.tsx   # 录音组件（流水线核心）
│   ├── TranscriptView.tsx    # 转写预览组件
│   └── WordCloud.tsx         # 词云组件
├── hooks/
│   ├── useSpeechRecognition.ts
│   ├── useSilenceDetection.ts
│   └── use-mobile.ts
└── lib/
    └── utils.ts

public/
└── wordcloud-example.png     # 词云例图
```

## 代码检查

```bash
pnpm lint       # ESLint 检查
pnpm ts-check   # TypeScript 类型检查
```
