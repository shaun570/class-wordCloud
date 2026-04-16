import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5分钟超时

export async function POST(request: NextRequest) {
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

    // Convert File to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');

    // Call ASR API
    const config = new Config();
    const client = new ASRClient(config);

    const result = await client.recognize({
      uid: `chunk-${chunkId || Date.now()}`,
      base64Data: base64Data,
    });

    return NextResponse.json({
      success: true,
      chunkId,
      text: result.text,
      duration: result.duration,
    });
  } catch (error) {
    console.error('ASR transcription error:', error);
    return NextResponse.json(
      { 
        error: '语音转写失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
