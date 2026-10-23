import * as z from 'zod/mini';
import { http, HttpResponse } from 'msw';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const metadataSchema = z.object({ name: z.string() });

type UpdatedDriveFile = {
  id: string;
  modifiedTime: string;
  name: string;
};

export type GetFileRequestContext = {
  alt: string | null;
  authorization: string | null;
  fileId: string;
  request: Request;
};

export type GetRevisionRequestContext = {
  authorization: string | null;
  fileId: string;
  request: Request;
  revId: string;
};

export type UpdateFileRequestContext = {
  authorization: string | null;
  body: Uint8Array;
  fields: string | null;
  fileId: string;
  request: Request;
  uploadType: string | null;
};

export type CreateFileRequestContext = {
  authorization: string | null;
  contentType: string | null;
  fields: string | null;
  fileBytes: Uint8Array;
  metadata: { name: string } | null;
  request: Request;
  uploadType: string | null;
};

type HandlerResponse = Response | Promise<Response>;

type Rev = string | (() => string);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const indexOfBytes = (haystack: Uint8Array, needle: Uint8Array, from = 0): number => {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
};

const parseMultipartRelated = (bodyBytes: Uint8Array, contentType: string | null) => {
  const boundary = contentType?.match(/boundary=([^;]+)/)?.[1] ?? '';

  const boundaryMarker = textEncoder.encode(`--${boundary}`);
  const closingBoundaryMarker = textEncoder.encode(`--${boundary}--`);
  const blankLine = textEncoder.encode('\r\n\r\n');
  const crlf = textEncoder.encode('\r\n');

  const firstBoundaryIndex = indexOfBytes(bodyBytes, boundaryMarker, 0);
  const firstHeadersEnd = indexOfBytes(bodyBytes, blankLine, firstBoundaryIndex);
  const metadataStart = firstHeadersEnd + blankLine.length;

  const secondBoundaryIndex = indexOfBytes(bodyBytes, boundaryMarker, metadataStart);
  const metadataEnd = secondBoundaryIndex - crlf.length;

  const secondHeadersEnd = indexOfBytes(bodyBytes, blankLine, secondBoundaryIndex);
  const fileBytesStart = secondHeadersEnd + blankLine.length;

  const closingBoundaryIndex = indexOfBytes(bodyBytes, closingBoundaryMarker, fileBytesStart);
  const fileBytesEnd = closingBoundaryIndex - crlf.length;

  const metadataText = textDecoder.decode(bodyBytes.slice(metadataStart, metadataEnd));
  const metadata = metadataText ? metadataSchema.parse(JSON.parse(metadataText)) : null;
  const fileBytes = bodyBytes.slice(fileBytesStart, fileBytesEnd);

  return { fileBytes, metadata };
};

const getFile = {
  // requests without alt=media read the file metadata, which is answered here with the rev
  mock: (resolver: (context: GetFileRequestContext) => HandlerResponse, { rev = 'rev-1' }: { rev?: Rev } = {}) => {
    return http.get(`${DRIVE_API_BASE}/files/:fileId`, ({ params, request }) => {
      const url = new URL(request.url);

      if (url.searchParams.get('alt') !== 'media') {
        return HttpResponse.json({ headRevisionId: typeof rev === 'function' ? rev() : rev });
      }

      return resolver({
        alt: url.searchParams.get('alt'),
        authorization: request.headers.get('authorization'),
        fileId: String(params.fileId),
        request,
      });
    });
  },
  ok: ({ bytes = new Uint8Array([1, 2, 3]), rev }: { bytes?: Uint8Array; rev?: Rev } = {}) => {
    return getFile.mock(
      () => {
        return new HttpResponse(bytes, {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      },
      { rev },
    );
  },
  error: ({ status = 500, statusText = 'Internal Server Error' }: { status?: number; statusText?: string } = {}) => {
    return getFile.mock(() => new HttpResponse(null, { status, statusText }));
  },
};

const getRevision = {
  mock: (resolver: (context: GetRevisionRequestContext) => HandlerResponse) => {
    return http.get(`${DRIVE_API_BASE}/files/:fileId/revisions/:revId`, ({ params, request }) => {
      return resolver({
        authorization: request.headers.get('authorization'),
        fileId: String(params.fileId),
        request,
        revId: String(params.revId),
      });
    });
  },
  ok: ({ bytes = new Uint8Array([1, 2, 3]) }: { bytes?: Uint8Array } = {}) => {
    return getRevision.mock(() => new HttpResponse(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  },
  error: ({ status = 500, statusText = 'Internal Server Error' }: { status?: number; statusText?: string } = {}) => {
    return getRevision.mock(() => new HttpResponse(null, { status, statusText }));
  },
};

const getRevError = ({
  status = 500,
  statusText = 'Internal Server Error',
}: { status?: number; statusText?: string } = {}) => {
  return http.get(`${DRIVE_API_BASE}/files/:fileId`, ({ request }) => {
    return new URL(request.url).searchParams.get('alt') === 'media'
      ? undefined
      : new HttpResponse(null, { status, statusText });
  });
};

const updateFile = {
  mock: (resolver: (context: UpdateFileRequestContext) => HandlerResponse) => {
    return http.patch(`${DRIVE_UPLOAD_BASE}/files/:fileId`, async ({ params, request }) => {
      const url = new URL(request.url);
      const body = new Uint8Array(await request.arrayBuffer());

      return await resolver({
        authorization: request.headers.get('authorization'),
        body,
        fields: url.searchParams.get('fields'),
        fileId: String(params.fileId),
        request,
        uploadType: url.searchParams.get('uploadType'),
      });
    });
  },
  ok: ({ file }: { file?: Partial<UpdatedDriveFile> } = {}) => {
    return updateFile.mock(({ fileId }) =>
      HttpResponse.json({
        id: file?.id ?? fileId,
        modifiedTime: file?.modifiedTime ?? new Date('2026-01-01T00:00:00.000Z').toISOString(),
        name: file?.name ?? 'vault.kdbx',
      }),
    );
  },
  error: ({ status = 500, statusText = 'Internal Server Error' }: { status?: number; statusText?: string } = {}) => {
    return updateFile.mock(() => new HttpResponse(null, { status, statusText }));
  },
};

const createFile = {
  mock: (resolver: (context: CreateFileRequestContext) => HandlerResponse) => {
    return http.post(`${DRIVE_UPLOAD_BASE}/files`, async ({ request }) => {
      const url = new URL(request.url);
      const contentType = request.headers.get('content-type');
      const bodyBytes = new Uint8Array(await request.arrayBuffer());
      const { fileBytes, metadata } = parseMultipartRelated(bodyBytes, contentType);

      return await resolver({
        authorization: request.headers.get('authorization'),
        contentType,
        fields: url.searchParams.get('fields'),
        fileBytes,
        metadata,
        request,
        uploadType: url.searchParams.get('uploadType'),
      });
    });
  },
  ok: ({ file }: { file?: Partial<UpdatedDriveFile> } = {}) => {
    return createFile.mock(({ metadata }) =>
      HttpResponse.json({
        id: file?.id ?? 'drive-file-id-xyz',
        modifiedTime: file?.modifiedTime ?? new Date('2026-01-01T00:00:00.000Z').toISOString(),
        name: file?.name ?? metadata?.name ?? 'vault.kdbx',
      }),
    );
  },
  error: ({ status = 500, statusText = 'Internal Server Error' }: { status?: number; statusText?: string } = {}) => {
    return createFile.mock(() => new HttpResponse(null, { status, statusText }));
  },
};

type FakeFile = {
  bytes: Uint8Array;
  rev: string;
  uploads: Uint8Array[];
};

// A Drive file that gets a new rev on every upload and keeps the bytes of every rev.
// Call `change` to act as another device.
const fakeFile = ({
  bytes = new Uint8Array([1, 2, 3]),
  rev = 'rev-1',
  onDownload,
  onRevRequest,
}: {
  bytes?: Uint8Array;
  rev?: string;
  onDownload?: () => void | Promise<void>;
  // called with the 1-based count of the rev reads, before the rev is read
  onRevRequest?: (count: number) => void;
} = {}) => {
  const file: FakeFile = { bytes, rev, uploads: [] };
  const history = new Map<string, Uint8Array>([[rev, bytes]]);
  let revRequests = 0;

  const change = (next: { bytes: Uint8Array; rev: string }) => {
    file.bytes = next.bytes;
    file.rev = next.rev;
    history.set(next.rev, next.bytes);
  };

  const handlers = [
    getFile.mock(() => new HttpResponse(null, { status: 500 }), {
      rev: () => {
        revRequests += 1;
        onRevRequest?.(revRequests);

        return file.rev;
      },
    }),
    getRevision.mock(async ({ revId }) => {
      await onDownload?.();

      const revBytes = history.get(revId);
      if (!revBytes) return new HttpResponse(null, { status: 404, statusText: 'Not Found' });

      return new HttpResponse(revBytes, { headers: { 'Content-Type': 'application/octet-stream' } });
    }),
    updateFile.mock(({ body, fileId }) => {
      file.uploads.push(body);
      change({ bytes: body, rev: `rev-upload-${file.uploads.length}` });

      return HttpResponse.json({
        id: fileId,
        modifiedTime: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        name: 'vault.kdbx',
      });
    }),
  ];

  return { change, file, handlers };
};

// happy-dom's fetch sends a CORS preflight before the authorized Drive requests, plain Node doesn't
const preflight = {
  ok: () => {
    return http.options('https://www.googleapis.com/*', () => {
      return new HttpResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
      });
    });
  },
};

export const googleDriveApi = {
  createFile,
  fakeFile,
  preflight,
  getFile,
  getRevError,
  getRevision,
  updateFile,
};
