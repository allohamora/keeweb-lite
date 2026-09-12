import kdbx from '@/lib/kdbx.lib';
import demoKdbxUrl from '@/assets/demo.kdbx?url';
import demoKdbxDataUrl from '@/assets/demo.kdbx?url&inline';
import { http, HttpResponse, type DefaultBodyType } from 'msw';

const demoFixtureBytes = new Uint8Array(kdbx.ByteUtils.base64ToBytes(demoKdbxDataUrl.split(',')[1] ?? ''));

export const demoFile = {
  mock: (resolver: () => HttpResponse<DefaultBodyType>) => {
    return http.get(demoKdbxUrl, resolver);
  },
  ok: (bytes: Uint8Array = demoFixtureBytes) => {
    return demoFile.mock(() => new HttpResponse(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  },
  error: ({ status = 404, statusText = 'Not Found' }: { status?: number; statusText?: string } = {}) => {
    return demoFile.mock(() => new HttpResponse(null, { status, statusText }));
  },
};
