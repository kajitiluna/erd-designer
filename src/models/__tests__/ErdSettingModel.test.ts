import ErdSettingModel from '../ErdSettingModel';
import DisplayStyle from '~/models/database/DisplayStyle';
import ExportDdlSettingModel from '~/models/ExportDdlSettingModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ErdSettingModel', () => {
    describe('constructor', () => {
        test('should create with provided values', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            expect(model.displayStyle).toEqual(DisplayStyle.LOGICAL);
            expect(model.exportDdlSetting.fileName).toBe(exportDdlSetting.fileName);
        });

        test('should create with default displayStyle when not provided', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            expect(model.displayStyle).toBe(DisplayStyle.BOTH);
            expect(model.exportDdlSetting.fileName).toBe(exportDdlSetting.fileName);
        });
    });

    describe('create static method', () => {
        test('should create with document name', () => {
            const documentName = 'MyERD';
            const model = ErdSettingModel.create(documentName);

            expect(model.displayStyle).toBe(DisplayStyle.BOTH);
            expect(model.exportDdlSetting).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.exportDdlSetting.fileName).toBe(documentName);
        });
    });

    describe('update', () => {
        test('should return same instance when no changes provided', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({});

            expect(updated).toBe(original);
        });

        test('should return same instance when all parameters are null', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({
                displayStyle: null,
                exportDdlSetting: null
            });

            expect(updated).toBe(original);
        });

        test('should update displayStyle only', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const updated = original.update({
                displayStyle: DisplayStyle.PHYSICAL
            });

            expect(updated).not.toBe(original);
            expect(updated.displayStyle).toBe(DisplayStyle.PHYSICAL);
            expect(updated.exportDdlSetting.fileName).toBe(exportDdlSetting.fileName);
        });

        test('should update exportDdlSetting only', () => {
            const originalExportSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const newExportSetting = new ExportDdlSettingModel({ fileName: 'new.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: originalExportSetting.toJSON()
            });

            const updated = original.update({
                exportDdlSetting: newExportSetting
            });

            expect(updated).not.toBe(original);
            expect(updated.displayStyle).toEqual(DisplayStyle.LOGICAL);
            expect(updated.exportDdlSetting).toBe(newExportSetting);
        });

        test('should update both properties', () => {
            const originalExportSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const newExportSetting = new ExportDdlSettingModel({ fileName: 'new.sql' });
            const original = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: originalExportSetting.toJSON()
            });

            const updated = original.update({
                displayStyle: DisplayStyle.PHYSICAL,
                exportDdlSetting: newExportSetting
            });

            expect(updated).not.toBe(original);
            expect(updated.displayStyle).toBe(DisplayStyle.PHYSICAL);
            expect(updated.exportDdlSetting).toBe(newExportSetting);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const exportDdlSetting = new ExportDdlSettingModel({ fileName: 'test.sql' });
            const model = ErdSettingModel.toObject({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });

            const json = model.toJSON();

            expect(json).toEqual({
                displayStyle: DisplayStyle.LOGICAL.toJSON(),
                exportDdlSetting: exportDdlSetting.toJSON()
            });
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
            expect(model.displayStyle).toBeInstanceOf(DisplayStyle);
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
            expect(model.displayStyle).toBe(DisplayStyle.BOTH);
            expect(model.exportDdlSetting).toBeInstanceOf(ExportDdlSettingModel);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = ErdSettingModel.create('test-document');

            const json = original.toJSON();
            const deserialized = ErdSettingModel.toObject(json);

            expect(deserialized).toBeInstanceOf(ErdSettingModel);
            expect(deserialized.displayStyle).toEqual(original.displayStyle);
            expect(deserialized.exportDdlSetting.fileName).toBe(original.exportDdlSetting.fileName);
        });

        test('should throw error when exportDdlSetting is missing', () => {
            const obj = {
                displayStyle: DisplayStyle.BOTH.toJSON()
            };

            expect(() => ErdSettingModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});