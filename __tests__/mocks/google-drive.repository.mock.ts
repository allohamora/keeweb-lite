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

type HandlerResponse = Response | Promise<Response>;

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
  updateFile,
};
