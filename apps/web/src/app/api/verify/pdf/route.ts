import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const limit = 10 * 1024 * 1024 + 16384;
  if (!request.body || Number(request.headers.get('content-length') || 0) > limit)
    return NextResponse.json({ success: false, error: 'PDF không được quá 10 MB' }, { status: 413 });
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return NextResponse.json({ success: false, error: 'PDF không được quá 10 MB' }, { status: 413 });
      }
      chunks.push(result.value);
    }
    const form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') || '' }, body: Buffer.concat(chunks) }).formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
      return NextResponse.json({ success: false, error: 'Cần file PDF không quá 10 MB' }, { status: 400 });
    const upload = new FormData();
    upload.append('file', file);
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const upstream = await fetch(apiUrl + '/verify/pdf', { method: 'POST', body: upload, cache: 'no-store', signal: AbortSignal.timeout(60000) });
    const result = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ success: false, error: result.message || 'Không thể xác thực PDF' }, { status: upstream.status });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ success: false, error: 'Không đọc được PDF hoặc dịch vụ xác thực chưa sẵn sàng' }, { status: 503 });
  }
}
