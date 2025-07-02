import ColumnGroupModel from '../ColumnGroupModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ColumnGroupModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const model = new ColumnGroupModel({});

            expect(model.columnGroupId).toBeTruthy(); // UUID should be generated
            expect(model.groupName).toBe('');
            expect(model.columnModelIds).toEqual([]);
            expect(model.description).toBe('');
        });

        test('should create with provided columnGroupId', () => {
            const id = 'test-group-id';
            const model = new ColumnGroupModel({ columnGroupId: id });

            expect(model.columnGroupId).toBe(id);
        });

        test('should create with provided values', () => {
            const options = {
                columnGroupId: 'test-group-id',
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2', 'col3'],
                description: 'Test description'
            };

            const model = new ColumnGroupModel(options);

            expect(model.columnGroupId).toBe(options.columnGroupId);
            expect(model.groupName).toBe(options.groupName);
            expect(model.columnModelIds).toEqual(options.columnModelIds);
            expect(model.description).toBe(options.description);
        });

        test('should trim groupName whitespace', () => {
            const model = new ColumnGroupModel({ groupName: '  Test Group  ' });

            expect(model.groupName).toBe('Test Group');
        });

        test('should generate new UUID when columnGroupId is empty string', () => {
            const model = new ColumnGroupModel({ columnGroupId: '' });

            expect(model.columnGroupId).toBeTruthy();
            expect(model.columnGroupId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const model = new ColumnGroupModel({
                columnGroupId: 'test-group-id',
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnGroupId: 'test-group-id',
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const obj = {
                columnGroupId: 'test-group-id',
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            };

            const model = ColumnGroupModel.toObject(obj);

            expect(model).toBeInstanceOf(ColumnGroupModel);
            expect(model.columnGroupId).toBe(obj.columnGroupId);
            expect(model.groupName).toBe(obj.groupName);
            expect(model.columnModelIds).toEqual(obj.columnModelIds);
            expect(model.description).toBe(obj.description);
        });

        test('should convert from plain object without description', () => {
            const obj = {
                columnGroupId: 'test-group-id',
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2']
            };

            const model = ColumnGroupModel.toObject(obj);

            expect(model).toBeInstanceOf(ColumnGroupModel);
            expect(model.description).toBe('');
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = new ColumnGroupModel({
                columnGroupId: 'test-group-id',
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });

            const json = original.toJSON();
            const deserialized = ColumnGroupModel.toObject(json);

            expect(deserialized).toBeInstanceOf(ColumnGroupModel);
            expect(deserialized.columnGroupId).toBe(original.columnGroupId);
            expect(deserialized.groupName).toBe(original.groupName);
            expect(deserialized.columnModelIds).toEqual(original.columnModelIds);
            expect(deserialized.description).toBe(original.description);
        });

        test('should throw error when columnGroupId is missing', () => {
            const obj = {
                groupName: 'Test Group',
                columnModelIds: ['col1', 'col2']
            };

            expect(() => ColumnGroupModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when groupName is missing', () => {
            const obj = {
                columnGroupId: 'test-group-id',
                columnModelIds: ['col1', 'col2']
            };

            expect(() => ColumnGroupModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when columnModelIds is missing', () => {
            const obj = {
                columnGroupId: 'test-group-id',
                groupName: 'Test Group'
            };

            expect(() => ColumnGroupModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});