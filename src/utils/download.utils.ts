import { asArrayBuffer } from '@/utils/buffer.utils';

export const downloadBytes = ({
  bytes,
  fileName,
  mimeType = 'application/octet-stream',
}: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
}) => {
  const blob = new Blob([asArrayBuffer(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 0);
};
