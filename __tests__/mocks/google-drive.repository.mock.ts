import { http, HttpResponse } from 'msw';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

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
  const metadata = metadataText ? (JSON.parse(metadataText) as { name: string }) : null;
  const fileBytes = bodyBytes.slice(fileBytesStart, fileBytesEnd);

  return { fileBytes, metadata };
};

const getFile = {
  mock: (resolver: (context: GetFileRequestContext) => HandlerResponse) => {
    return http.get(`${DRIVE_API_BASE}/files/:fileId`, ({ params, request }) => {
      const url = new URL(request.url);

      return resolver({
        alt: url.searchParams.get('alt'),
        authorization: request.headers.get('authorization'),
        fileId: String(params.fileId),
        request,
      });
    });
  },
  ok: ({ bytes = new Uint8Array([1, 2, 3]) }: { bytes?: Uint8Array } = {}) => {
    return getFile.mock(() => {
      return new HttpResponse(bytes, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    });
  },
  error: ({ status = 500, statusText = 'Internal Server Error' }: { status?: number; statusText?: string } = {}) => {
    return getFile.mock(() => new HttpResponse(null, { status, statusText }));
  },
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

export const googleDriveApi = {
  createFile,
  getFile,
  updateFile,
};
