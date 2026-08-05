// Strips the GCS upload timestamp prefix (e.g. "1783945358386_report.pdf")
// so the UI shows the original filename the student uploaded.
export function fileNameFromGcsUri(uri: string): string {
  const parts = uri.split('/');
  const name = parts[parts.length - 1] || uri;
  return name.replace(/^\d{10,}_/, '');
}

export function statusDotClass(status: string): { dot: string; text: string } {
  if (status === 'approved') return { dot: 'bg-green-500', text: 'text-green-500' };
  if (status === 'changes_requested') return { dot: 'bg-red-400', text: 'text-red-400' };
  return { dot: 'bg-gold', text: 'text-gold' };
}
