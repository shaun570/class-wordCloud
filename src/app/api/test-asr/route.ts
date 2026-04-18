import { NextRequest, NextResponse } from 'next/server';
import { S3Storage, ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: '缺少音频文件' }, { status: 400 });
    }

    console.log(`[TEST] 接收音频: type=${audioFile.type}, size=${audioFile.size}`);

    // 上传到对象存储
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      bucketName: process.env.COZE_BUCKET_NAME,
    });

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const fileName = `test/audio_${Date.now()}.m4a`;
    
    console.log(`[TEST] 上传文件: ${fileName}`);
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: 'audio/mp4',
    });
    console.log(`[TEST] 上传成功, key: ${key}`);

    // 生成签名 URL
    const url = await storage.generatePresignedUrl({ key, expireTime: 3600 });
    console.log(`[TEST] 签名URL: ${url}`);

    // 提取 headers
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    console.log(`[TEST] Headers: ${JSON.stringify(Object.keys(customHeaders))}`);

    // 测试 ASR - 使用 URL
    const config = new Config();
    const client = new ASRClient(config, customHeaders);
    
    console.log(`[TEST] 开始 ASR 识别...`);
    const result = await client.recognize({
      uid: `test-${Date.now()}`,
      url: url,
    });
    console.log(`[TEST] ASR 成功: ${result.text?.substring(0, 100)}`);

    // 清理
    await storage.deleteFile({ fileKey: key });

    return NextResponse.json({
      success: true,
      text: result.text,
      url: url,
    });
  } catch (error) {
    console.error('[TEST] 错误:', error);
    const err = error as { message?: string; statusCode?: number };
    return NextResponse.json({
      error: error instanceof Error ? error.message : '未知错误',
      statusCode: err.statusCode,
    }, { status: 500 });
  }
}
