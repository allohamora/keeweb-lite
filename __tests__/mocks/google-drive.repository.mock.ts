import { http, HttpResponse } from 'msw';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

type ListFolderFile = {
  id: string;
  mimeType: string;
  name: string;
};

type UpdatedDriveFile = {
  id: string;
  modifiedTime: string;
  name: string;
};

export type ListFolderRequestContext = {
  authorization: string | null;
  extension: string | null;
  folderId: string | null;
  request: Request;
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

type HandlerResponse = Response | Promise<Response>;

const parseFolderId = (query: string | null) => {
  const match = query?.match(/"([^"]+)"\s+in parents/u);
  return match?.[1] ?? null;
};

const parseExtension = (query: string | null) => {
  const match = query?.match(/name contains '\.([^']+)'/u);
  return match?.[1] ?? null;
};

const listFolder = {
  mock: (resolver: (context: ListFolderRequestContext) => HandlerResponse) => {
    return http.get(`${DRIVE_API_BASE}/files`, ({ request }) => {
      const url = new URL(request.url);
      const query = url.searchParams.get('q');

      return resolver({
        authorization: request.headers.get('authorization'),
        extension: parseExtension(query),
        folderId: parseFolderId(query),
        request,
      });
    });
  },
  ok: ({ files = [] }: { files?: ListFolderFile[] } = {}) => {
    return listFolder.mock(() => HttpResponse.json({ files }));
  },
  error: ({ status = 500, statusText = 'Internal Server Error' }: { status?: number; statusText?: string } = {}) => {
    return listFolder.mock(() => new HttpResponse(null, { status, statusText }));
  },
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

export const googleDriveApi = {
  getFile,
  listFolder,
  updateFile,
};
