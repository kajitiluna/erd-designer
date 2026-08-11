import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { FileDocumentResource } from '~/agent-tools/FileDocumentResource';
import { DatabaseType } from '~/models/database';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import ErdDocument from '~/models/ErdDocument';

let workDirectory: string;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-file-resource-'));
});

afterEach(() => {
    fs.rmSync(workDirectory, { recursive: true, force: true });
});

const initTestDocument = (documentName: string, databaseType: DatabaseType): ErdDocument => {
    const databaseSettingModel = DatabaseSettingModel.create(databaseType);
    return ErdDocument.create({ documentName: documentName, databaseSettingModel: databaseSettingModel });
};

describe('FileDocumentResource.create', () => {
    test('新規ファイルを書き出し、読み戻せる', async () => {
        const resource = new FileDocumentResource();
        const filePath = path.join(workDirectory, 'shop.erd');

        const created = await resource.create(filePath, initTestDocument('shop', 'postgres'));

        const content = fs.readFileSync(filePath, 'utf-8');
        const loaded = ErdDocument.toObject(JSON.parse(content));
        expect(loaded.documentName).toBe('shop');
        expect(loaded.databaseSettingModel.databaseType).toBe('postgres');
        expect(created.fileUri.endsWith('/shop.erd')).toBe(true);
    });

    test('ERD Designer アプリと同じ 4 スペースインデントで保存する', async () => {
        const resource = new FileDocumentResource();
        const filePath = path.join(workDirectory, 'shop.erd');

        await resource.create(filePath, initTestDocument('shop', 'mysql'));

        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        expect(lines[1].startsWith('    "')).toBe(true);
    });

    test('作成したドキュメントは同じ documentId で参照できる', async () => {
        const resource = new FileDocumentResource();
        const filePath = path.join(workDirectory, 'shop.erd');

        const created = await resource.create(filePath, initTestDocument('shop', 'mysql'));

        expect(resource.findById(created.documentId)).not.toBeNull();
        expect(resource.findByUri(created.fileUri)?.documentId).toBe(created.documentId);
        expect(resource.tryRegister(filePath)).toBe(created.documentId);
    });

    test('既存ファイルには書き込まず、内容も変更しない', async () => {
        const resource = new FileDocumentResource();
        const filePath = path.join(workDirectory, 'shop.erd');
        await resource.create(filePath, initTestDocument('shop', 'postgres'));
        const originalContent = fs.readFileSync(filePath, 'utf-8');

        await expect(resource.create(filePath, initTestDocument('other', 'mysql')))
            .rejects.toThrow(/File already exists/);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe(originalContent);
    });

    test('親ディレクトリが存在しない場合はエラーになる', async () => {
        const resource = new FileDocumentResource();
        const filePath = path.join(workDirectory, 'missing', 'shop.erd');

        await expect(resource.create(filePath, initTestDocument('shop', 'mysql')))
            .rejects.toThrow(/Directory does not exist/);
    });
});

describe('FileDocumentResource.tryRegister', () => {
    test('存在しないファイルでは null を返す', () => {
        const resource = new FileDocumentResource();

        expect(resource.tryRegister(path.join(workDirectory, 'absent.erd'))).toBeNull();
    });
});
