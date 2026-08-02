import ErdSettingModel from '../ErdSettingModel';
import DisplayNameStyle from '~/models/DisplayNameStyle';
import ExportDdlSettingModel from '~/models/ExportDdlSettingModel';
import { PropertyNotExistsError } from '~/models/exceptions';
import PerspectiveModel from '~/models/PerspectiveModel';

describe('ErdSettingModel', () => {
    describe('constructor', () => {
        test('should create with provided values', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            expect(model.displayNameStyle).toEqual(DisplayNameStyle.LOGICAL);
            expect(model.exportDdlSetting.fileName).toBe(exportDdlSetting.fileName);
        });

        test('should create with default displayStyle when not provided', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            expect(model.displayNameStyle).toBe(DisplayNameStyle.BOTH);
            expect(model.exportDdlSetting.fileName).toBe(exportDdlSetting.fileName);
        });
    });

    describe('create static method', () => {
        test('should create with document name', () => {
            const documentName = 'MyERD';
            const model = ErdSettingModel.create(documentName);

            expect(model.displayNameStyle).toBe(DisplayNameStyle.BOTH);
            expect(model.exportDdlSetting).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.exportDdlSetting.fileName).toBe(documentName);
        });
    });

    describe('update', () => {
        test('should return same instance when no changes provided', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({});

            expect(updated).toBe(original);
        });

        test('should return same instance when all parameters are null', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({
                displayNameStyle: null,
                exportDdlSetting: null
            });

            expect(updated).toBe(original);
        });

        test('should update displayStyle only', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({
                displayNameStyle: DisplayNameStyle.PHYSICAL
            });

            expect(updated).not.toBe(original);
            expect(updated.displayNameStyle).toBe(DisplayNameStyle.PHYSICAL);
            expect(updated.exportDdlSetting.fileName).toBe(exportDdlSetting.fileName);
        });

        test('should update exportDdlSetting only', () => {
            const originalExportSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const newExportSetting = new ExportDdlSettingModel({ fileName: 'new.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: originalExportSetting.toJSON()
            });

            const updated = original.update({
                exportDdlSetting: newExportSetting
            });

            expect(updated).not.toBe(original);
            expect(updated.displayNameStyle).toEqual(DisplayNameStyle.LOGICAL);
            expect(updated.exportDdlSetting).toBe(newExportSetting);
        });

        test('should update both properties', () => {
            const originalExportSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const newExportSetting = new ExportDdlSettingModel({ fileName: 'new.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: originalExportSetting.toJSON()
            });

            const updated = original.update({
                displayNameStyle: DisplayNameStyle.PHYSICAL,
                exportDdlSetting: newExportSetting
            });

            expect(updated).not.toBe(original);
            expect(updated.displayNameStyle).toBe(DisplayNameStyle.PHYSICAL);
            expect(updated.exportDdlSetting).toBe(newExportSetting);
        });

        test('should update syncRemoteChanges only', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({
                syncRemoteChanges: true
            });

            expect(updated).not.toBe(original);
            expect(updated.syncRemoteChanges).toBe(true);
            expect(updated.displayNameStyle).toEqual(DisplayNameStyle.LOGICAL);
        });

        test('should return same instance when all parameters including syncRemoteChanges are null', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({
                displayNameStyle: null,
                exportDdlSetting: null,
                perspectiveModels: null,
                showRelationNames: null,
                syncRemoteChanges: null
            });

            expect(updated).toBe(original);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const json = model.toJSON();

            expect(json).toEqual({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });
        });

        test('should omit syncRemoteChanges when false', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('syncRemoteChanges');
        });

        test('should include syncRemoteChanges when true', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                displayStyle: DisplayNameStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            }).update({ syncRemoteChanges: true });

            const json = model.toJSON();

            expect(json).toEqual(expect.objectContaining({ syncRemoteChanges: true }));
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const exportDdlSettingJson = {
                fileName: 'test.sql',
                withTable: true,
                withIndex: true,
                withForeignKey: true,
                withComment: true
            };

            const obj = {
                displayStyle: {
                    physicalNameVisible: true,
                    logicalNameVisible: false,
                    commentVisible: false,
                    columnTypeVisible: true,
                    notNullMarkVisible: true,
                    defaultValueVisible: false,
                    primaryKeyVisible: true,
                    indexMarkVisible: false
                },
                exportDdlSetting: exportDdlSettingJson
            };

            const model = ErdSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ErdSettingModel);
            expect(model.displayNameStyle).toBeInstanceOf(DisplayNameStyle);
            expect(model.exportDdlSetting).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.exportDdlSetting.fileName).toBe('test.sql');
        });

        test('should convert from plain object without displayStyle (defaults to BOTH)', () => {
            const exportDdlSettingJson = {
                fileName: 'test.sql',
                withTable: true,
                withIndex: true,
                withForeignKey: true,
                withComment: true
            };

            const obj = {
                exportDdlSetting: exportDdlSettingJson
            };

            const model = ErdSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ErdSettingModel);
            expect(model.displayNameStyle).toBe(DisplayNameStyle.BOTH);
            expect(model.exportDdlSetting).toBeInstanceOf(ExportDdlSettingModel);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = ErdSettingModel.create('test-document');

            const json = original.toJSON();
            const deserialized = ErdSettingModel.toObject(json);

            expect(deserialized).toBeInstanceOf(ErdSettingModel);
            expect(deserialized.displayNameStyle).toEqual(original.displayNameStyle);
            expect(deserialized.exportDdlSetting.fileName).toBe(original.exportDdlSetting.fileName);
        });

        test('should throw error when exportDdlSetting is missing', () => {
            const obj = {
                displayStyle: DisplayNameStyle.BOTH.toJSON()
            };

            expect(() => ErdSettingModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should default syncRemoteChanges to false when not provided', () => {
            const exportDdlSettingJson = {
                fileName: 'test.sql',
                withTable: true,
                withIndex: true,
                withForeignKey: true,
                withComment: true
            };

            const obj = {
                exportDdlSetting: exportDdlSettingJson
            };

            const model = ErdSettingModel.toObject(obj);

            expect(model.syncRemoteChanges).toBe(false);
        });

        test('should round-trip syncRemoteChanges through toJSON/toObject', () => {
            const original = ErdSettingModel.create('test-document').update({ syncRemoteChanges: true });

            const json = original.toJSON();
            const deserialized = ErdSettingModel.toObject(json);

            expect(deserialized.syncRemoteChanges).toBe(true);
        });
    });

    describe('updatePerspective', () => {
        test('should keep syncRemoteChanges after updating a perspective', () => {
            const original = ErdSettingModel.create('test-document').update({ syncRemoteChanges: true });
            const perspective = PerspectiveModel.create('Test Perspective');

            const updated = original.updatePerspective(perspective);

            expect(updated).not.toBe(original);
            expect(updated.syncRemoteChanges).toBe(true);
            expect(updated.findPerspectiveModel(perspective.perspectiveId)).not.toBeNull();
        });
    });

    describe('equals', () => {
        test('should return true when syncRemoteChanges matches', () => {
            const first = ErdSettingModel.create('test-document').update({ syncRemoteChanges: true });
            const second = ErdSettingModel.create('test-document').update({ syncRemoteChanges: true });

            expect(first.equals(second)).toBe(true);
        });

        test('should return false when syncRemoteChanges differs', () => {
            const first = ErdSettingModel.create('test-document').update({ syncRemoteChanges: true });
            const second = ErdSettingModel.create('test-document');

            expect(first.equals(second)).toBe(false);
        });
    });
});