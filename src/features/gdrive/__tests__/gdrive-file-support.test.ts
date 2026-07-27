import { vi, describe, test, expect, beforeEach } from 'vitest';

import { findRemoteUpdate, GdriveRequestError } from '~/features/gdrive/gdrive-file-support';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';

// ---- フィクスチャ ----

const TEST_FILE_ID = 'test-file-id-001';
const TEST_ACCESS_TOKEN = 'test-access-token';
const CURRENT_VERSION = '2026-01-01T00:00:00.000Z';
const UPDATED_VERSION = '2026-01-02T00:00:00.000Z';

const createTestDocument = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test',
        erdSettingModel: ErdSettingModel.create('test'),
        databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
    });
};

const createOkResponse = (body: unknown): Response => {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body,
        text: async () => JSON.stringify(body)
    } as unknown as Response;
};

const createErrorResponse = (status: number, statusText: string): Response => {
    return {
        ok: false,
        status,
        statusText,
        json: async () => {
            throw new Error('should not be called');
        },
        text: async () => 'error detail'
    } as unknown as Response;
};

const createBrokenJsonResponse = (): Response => {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
            throw new Error('invalid json');
        },
        text: async () => 'broken'
    } as unknown as Response;
};

const isMetadataRequest = (url: string): boolean => {
    return url.includes('fields=');
};

const stubFetchWith = (metadataResponse: Response, contentResponse: Response): void => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (isMetadataRequest(url)) {
            return metadataResponse;
        }
        return contentResponse;
    });
};

// ---- テスト ----

describe('findRemoteUpdate', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    test('modifiedTime が currentVersion と一致する場合、本文を取得せず updated: false を返す', async () => {
        const metadataResponse = createOkResponse({ name: 'test.erd', modifiedTime: CURRENT_VERSION });
        stubFetchWith(metadataResponse, createErrorResponse(500, 'Internal Server Error'));

        const result = await findRemoteUpdate({
            accessToken: TEST_ACCESS_TOKEN, fileId: TEST_FILE_ID, currentVersion: CURRENT_VERSION
        });

        expect(result).toEqual({ updated: false, version: CURRENT_VERSION });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('modifiedTime が currentVersion と不一致の場合、本文を取得して updated: true を返す', async () => {
        const erdDocument = createTestDocument();
        const metadataResponse = createOkResponse({ name: 'test.erd', modifiedTime: UPDATED_VERSION });
        const contentResponse = createOkResponse(erdDocument.toJSON());
        stubFetchWith(metadataResponse, contentResponse);

        const result = await findRemoteUpdate({
            accessToken: TEST_ACCESS_TOKEN, fileId: TEST_FILE_ID, currentVersion: CURRENT_VERSION
        });

        expect(result.updated).toBe(true);
        expect(result.version).toBe(UPDATED_VERSION);
        if (result.updated === true) {
            expect(result.erdDocument).toBeInstanceOf(ErdDocument);
        }
        // findRemoteUpdate 自身のメタデータ確認 (1回) + openGdriveFile 内の本文/メタデータ並行取得 (2回)
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('メタデータ取得が401を返す場合、GdriveRequestError が status 401 で throw される', async () => {
        const metadataResponse = createErrorResponse(401, 'Unauthorized');
        stubFetchWith(metadataResponse, createErrorResponse(401, 'Unauthorized'));

        const findRemoteUpdatePromise = findRemoteUpdate({
            accessToken: TEST_ACCESS_TOKEN, fileId: TEST_FILE_ID, currentVersion: CURRENT_VERSION
        });

        await expect(findRemoteUpdatePromise).rejects.toBeInstanceOf(GdriveRequestError);
        await expect(findRemoteUpdatePromise).rejects.toMatchObject({ status: 401 });
    });

    test('本文取得のレスポンスが不正なJSONの場合、throw される', async () => {
        const metadataResponse = createOkResponse({ name: 'test.erd', modifiedTime: UPDATED_VERSION });
        const contentResponse = createBrokenJsonResponse();
        stubFetchWith(metadataResponse, contentResponse);

        const findRemoteUpdatePromise = findRemoteUpdate({
            accessToken: TEST_ACCESS_TOKEN, fileId: TEST_FILE_ID, currentVersion: CURRENT_VERSION
        });

        await expect(findRemoteUpdatePromise).rejects.toThrow();
    });
});
