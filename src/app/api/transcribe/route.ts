import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils, S3Storage } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5分钟超时

export async function POST(request: NextRequest) {
  let fileKey: string | null = null;
  let storage: S3Storage | null = null;
  
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const chunkId = formData.get('chunkId') as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: '缺少音频文件' },
        { status: 400 }
      );
    }

    console.log(`[ASR] 接收音频: chunkId=${chunkId}, name=${audioFile.name}, type=${audioFile.type}, size=${audioFile.size}`);

    // Step 1: 将音频上传到对象存储
    storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      bucketName: process.env.COZE_BUCKET_NAME,
    });

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 生成唯一的文件名
    const timestamp = Date.now();
    const originalName = audioFile.name.replace(/\.[^/.]+$/, ''); // 移除扩展名
    const fileName = `meeting-audio/${originalName}_${chunkId || timestamp}.m4a`;

    console.log(`[ASR] 上传音频到对象存储: ${fileName}`);
    
    fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: 'audio/mp4', // ASR 支持 M4A
    });

    console.log(`[ASR] 上传成功, key=${fileKey}`);

    // Step 2: 生成签名 URL
    const audioUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600, // 1小时有效期
    });

    console.log(`[ASR] 生成签名URL: ${audioUrl.substring(0, 100)}...`);

    // Step 3: 使用 URL 方式调用 ASR
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ASRClient(config, customHeaders);

    const result = await client.recognize({
      uid: `chunk-${chunkId || timestamp}`,
      url: audioUrl,
    });

    console.log(`[ASR] 识别成功: 文本长度=${result.text?.length || 0}`);

    return NextResponse.json({
      success: true,
      chunkId,
      text: result.text,
      duration: result.duration,
    });
  } catch (error) {
    console.error('[ASR] 语音转写错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { 
        error: '语音转写失败',
        details: errorMessage
      },
      { status: 500 }
    );
  } finally {
    // 清理：删除临时上传的文件（可选，异步执行不阻塞响应）
    if (fileKey && storage) {
      storage.deleteFile({ fileKey }).catch((err: unknown) => {
        console.error(`[ASR] 清理临时文件失败: ${fileKey}`, err);
      });
    }
  }
}
