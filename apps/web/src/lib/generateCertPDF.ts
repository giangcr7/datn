export async function generateCertPDF(record: { uuid: string }, _verifyUrl?: string, stage: 'issued' | 'campus' = 'issued') {
  const response = await fetch('/api/cert/' + encodeURIComponent(record.uuid) + '/pdf' + (stage === 'campus' ? '?stage=campus' : ''), { cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
    let reason = 'Không tải được PDF ký số';
    try { const body = await response.json(); reason = body.error || body.message || reason; } catch {}
    throw new Error(reason);
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'VanBang_' + record.uuid + (stage === 'campus' ? '_campus' : '_signed') + '.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
