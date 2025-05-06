import { describe, expect, test } from 'vitest';
import TableIndexModel, { IndexColumnModel } from '../TableIndexModel';

describe('TableIndexModel', () => {
    describe('constructor', () => {
        test('should create with minimum required values', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels
            });

            expect(model.tableIndexModelId).toBe('idx-1');
            expect(model.physicalName).toBe('test_index');
            expect(model.indexColumnModels).toHaveLength(1);
            expect(model.indexOption).toBe('');
            expect(model.indexType).toBe('');
            expect(model.description).toBe('');
        });

        test('should create with all options', () => {
            const indexColumnModels = [
                new IndexColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC',
                    nullsOrderType: 'LAST'
                })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexOption: 'UNIQUE',
                indexType: 'BTREE',
                description: 'Test index'
            });

            expect(model.indexOption).toBe('UNIQUE');
            expect(model.indexType).toBe('BTREE');
            expect(model.description).toBe('Test index');
        });
    });

    describe('IndexColumnModel', () => {
        test('should create with minimum required values', () => {
            const model = new IndexColumnModel({
                columnModelId: 'col-1'
            });

            expect(model.columnModelId).toBe('col-1');
            expect(model.sortOrderType).toBe('');
            expect(model.nullsOrderType).toBe('');
        });

        test('should create with all options', () => {
            const model = new IndexColumnModel({
                columnModelId: 'col-1',
                sortOrderType: 'DESC',
                nullsOrderType: 'FIRST'
            });

            expect(model.sortOrderType).toBe('DESC');
            expect(model.nullsOrderType).toBe('FIRST');
        });
    });

    describe('serialization', () => {
        test('should serialize and deserialize correctly', () => {
            const original = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    })
                ],
                indexOption: 'UNIQUE'
            });

            const json = original.toJSON();
            const deserialized = TableIndexModel.toObject(json);

            expect(deserialized).toBeInstanceOf(TableIndexModel);
            expect(deserialized.tableIndexModelId).toBe(original.tableIndexModelId);
            expect(deserialized.indexColumnModels[0]).toBeInstanceOf(IndexColumnModel);
            expect(deserialized.indexColumnModels[0].columnModelId)
                .toBe(original.indexColumnModels[0].columnModelId);
        });
    });
});