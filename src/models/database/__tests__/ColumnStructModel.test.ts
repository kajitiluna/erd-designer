import ColumnStructModel from '../ColumnStructModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ColumnStructModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const model = new ColumnStructModel({});

            expect(model.columnStructId).toBeTruthy(); // UUID should be generated
            expect(model.structName).toBe('');
            expect(model.columnModelIds).toEqual([]);
            expect(model.description).toBe('');
        });

        test('should create with provided columnStructId', () => {
            const id = 'test-struct-id';
            const model = new ColumnStructModel({ columnStructId: id });

            expect(model.columnStructId).toBe(id);
        });

        test('should create with provided values', () => {
            const options = {
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2', 'col3'],
                description: 'Test description'
            };

            const model = new ColumnStructModel(options);

            expect(model.columnStructId).toBe(options.columnStructId);
            expect(model.structName).toBe(options.structName);
            expect(model.columnModelIds).toEqual(options.columnModelIds);
            expect(model.description).toBe(options.description);
        });

        test('should trim structName whitespace', () => {
            const model = new ColumnStructModel({ structName: '  Test Struct  ' });

            expect(model.structName).toBe('Test Struct');
        });

        test('should generate new UUID when columnStructId is empty string', () => {
            const model = new ColumnStructModel({ columnStructId: '' });

            expect(model.columnStructId).toBeTruthy();
            expect(model.columnStructId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const model = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });
        });

        test('should omit description when empty', () => {
            const model = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2']
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2']
            });
            expect('description' in json).toBe(false);
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const obj = {
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            };

            const model = ColumnStructModel.toObject(obj);

            expect(model).toBeInstanceOf(ColumnStructModel);
            expect(model.columnStructId).toBe(obj.columnStructId);
            expect(model.structName).toBe(obj.structName);
            expect(model.columnModelIds).toEqual(obj.columnModelIds);
            expect(model.description).toBe(obj.description);
        });

        test('should convert from plain object without description', () => {
            const obj = {
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2']
            };

            const model = ColumnStructModel.toObject(obj);

            expect(model).toBeInstanceOf(ColumnStructModel);
            expect(model.description).toBe('');
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });

            const json = original.toJSON();
            const deserialized = ColumnStructModel.toObject(json);

            expect(deserialized).toBeInstanceOf(ColumnStructModel);
            expect(deserialized.columnStructId).toBe(original.columnStructId);
            expect(deserialized.structName).toBe(original.structName);
            expect(deserialized.columnModelIds).toEqual(original.columnModelIds);
            expect(deserialized.description).toBe(original.description);
        });

        test('should throw error when columnStructId is missing', () => {
            const obj = {
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2']
            };

            expect(() => ColumnStructModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when structName is missing', () => {
            const obj = {
                columnStructId: 'test-struct-id',
                columnModelIds: ['col1', 'col2']
            };

            expect(() => ColumnStructModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when columnModelIds is missing', () => {
            const obj = {
                columnStructId: 'test-struct-id',
                structName: 'Test Struct'
            };

            expect(() => ColumnStructModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });

    describe('equals', () => {
        test('should return true for identical models', () => {
            const model1 = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });
            const model2 = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2'],
                description: 'Test description'
            });

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false when columnModelIds differ', () => {
            const model1 = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col2']
            });
            const model2 = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Test Struct',
                columnModelIds: ['col1', 'col3']
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false when structName differs', () => {
            const model1 = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Struct A',
                columnModelIds: ['col1']
            });
            const model2 = new ColumnStructModel({
                columnStructId: 'test-struct-id',
                structName: 'Struct B',
                columnModelIds: ['col1']
            });

            expect(model1.equals(model2)).toBe(false);
        });
    });
});
