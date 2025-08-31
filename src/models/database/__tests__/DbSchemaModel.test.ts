import DbSchemaModel from '../DbSchemaModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('DbSchemaModel', () => {
    describe('create', () => {
        test('should create schema with provided name, description and auto-generated ID', () => {
            const schema = DbSchemaModel.create('test_name', 'test_description');

            expect(schema.schemaId).toBeDefined();
            expect(typeof schema.schemaId).toBe('string');
            expect(schema.schemaId.length).toBeGreaterThan(0);
            expect(schema.schemaName).toBe('test_name');
            expect(schema.description).toBe('test_description');
        });

        test('should generate unique IDs for different schemas', () => {
            const schema1 = DbSchemaModel.create('test_name_1', 'description_1');
            const schema2 = DbSchemaModel.create('test_name_2', 'description_2');

            expect(schema1.schemaId).not.toBe(schema2.schemaId);
        });
    });

    describe('update', () => {
        test('should return new schema with updated name', () => {
            const originalSchema = DbSchemaModel.create('original_name', 'original_description');
            const updatedSchema = originalSchema.update({ schemaName: 'updated_name' });

            expect(updatedSchema.schemaId).toBe(originalSchema.schemaId);
            expect(updatedSchema.schemaName).toBe('updated_name');
            expect(updatedSchema.description).toBe('original_description'); // Description should remain unchanged
            expect(originalSchema.schemaName).toBe('original_name'); // Original should remain unchanged
        });

        test('should return new schema with updated description', () => {
            const originalSchema = DbSchemaModel.create('test_name', 'original_description');
            const updatedSchema = originalSchema.update({ description: 'updated_description' });

            expect(updatedSchema.schemaId).toBe(originalSchema.schemaId);
            expect(updatedSchema.schemaName).toBe('test_name'); // Name should remain unchanged
            expect(updatedSchema.description).toBe('updated_description');
            expect(originalSchema.description).toBe('original_description'); // Original should remain unchanged
        });

        test('should return new schema with both name and description updated', () => {
            const originalSchema = DbSchemaModel.create('original_name', 'original_description');
            const updatedSchema = originalSchema.update({ 
                schemaName: 'updated_name', 
                description: 'updated_description' 
            });

            expect(updatedSchema.schemaId).toBe(originalSchema.schemaId);
            expect(updatedSchema.schemaName).toBe('updated_name');
            expect(updatedSchema.description).toBe('updated_description');
        });

        test('should return new schema with no changes when no update args provided', () => {
            const originalSchema = DbSchemaModel.create('test_name', 'test_description');
            const updatedSchema = originalSchema.update({});

            expect(updatedSchema.schemaId).toBe(originalSchema.schemaId);
            expect(updatedSchema.schemaName).toBe('test_name');
            expect(updatedSchema.description).toBe('test_description');
        });
    });

    describe('toJSON', () => {
        test('should serialize to JSON object', () => {
            const schema = DbSchemaModel.create('test_schema', 'test_description');
            const json = schema.toJSON();

            expect(json).toEqual({
                schemaId: schema.schemaId,
                schemaName: 'test_schema',
                description: 'test_description'
            });
        });
    });

    describe('toObject', () => {
        test('should deserialize from valid object', () => {
            const obj = {
                schemaId: 'test-id',
                schemaName: 'test_schema',
                description: 'test_description'
            };

            const schema = DbSchemaModel.toObject(obj);

            expect(schema.schemaId).toBe('test-id');
            expect(schema.schemaName).toBe('test_schema');
            expect(schema.description).toBe('test_description');
        });

        test('should deserialize from object without description', () => {
            const obj = {
                schemaId: 'test-id',
                schemaName: 'test_schema'
            };

            const schema = DbSchemaModel.toObject(obj);

            expect(schema.schemaId).toBe('test-id');
            expect(schema.schemaName).toBe('test_schema');
            expect(schema.description).toBe('');
        });

        test('should throw PropertyNotExistsError when schemaId is missing', () => {
            const obj = {
                schemaName: 'test_schema',
                description: 'test_description'
            };

            expect(() => DbSchemaModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should throw PropertyNotExistsError when schemaName is missing', () => {
            const obj = {
                schemaId: 'test-id',
                description: 'test_description'
            };

            expect(() => DbSchemaModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });
    });

    describe('equals', () => {
        test('should return true for schemas with same ID, name and description', () => {
            const obj1 = { schemaId: 'same-id', schemaName: 'test_schema', description: 'test_description' };
            const obj2 = { schemaId: 'same-id', schemaName: 'test_schema', description: 'test_description' };
            const schema1 = DbSchemaModel.toObject(obj1);
            const schema2 = DbSchemaModel.toObject(obj2);

            expect(schema1.equals(schema2)).toBe(true);
        });

        test('should return false for schemas with different IDs', () => {
            const schema1 = DbSchemaModel.create('test_schema', 'test_description');
            const schema2 = DbSchemaModel.create('test_schema', 'test_description');

            expect(schema1.equals(schema2)).toBe(false);
        });

        test('should return false for schemas with different names', () => {
            const obj1 = { schemaId: 'same-id', schemaName: 'test_schema_1', description: 'test_description' };
            const obj2 = { schemaId: 'same-id', schemaName: 'test_schema_2', description: 'test_description' };
            const schema1 = DbSchemaModel.toObject(obj1);
            const schema2 = DbSchemaModel.toObject(obj2);

            expect(schema1.equals(schema2)).toBe(false);
        });

        test('should return false for schemas with different descriptions', () => {
            const obj1 = { schemaId: 'same-id', schemaName: 'test_schema', description: 'description_1' };
            const obj2 = { schemaId: 'same-id', schemaName: 'test_schema', description: 'description_2' };
            const schema1 = DbSchemaModel.toObject(obj1);
            const schema2 = DbSchemaModel.toObject(obj2);

            expect(schema1.equals(schema2)).toBe(false);
        });
    });
});
