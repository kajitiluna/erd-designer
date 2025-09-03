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
            expect(model.clustered).toBe(false);
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
                clustered: true,
                description: 'Test index'
            });

            expect(model.indexOption).toBe('UNIQUE');
            expect(model.indexType).toBe('BTREE');
            expect(model.clustered).toBe(true);
            expect(model.description).toBe('Test index');
        });

        test('should trim physicalName', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: '  test_index  ',
                indexColumnModels
            });

            expect(model.physicalName).toBe('test_index');
        });

        test('should make indexColumnModels readonly', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels
            });

            // readonly配列なので、型レベルでpushなどは禁止されている
            expect(model.indexColumnModels).toEqual(indexColumnModels);
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

        describe('querySort', () => {
            test('should return empty string when sortOrderType is empty', () => {
                const model = new IndexColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: '',
                    nullsOrderType: 'FIRST'
                });

                expect(model.querySort()).toBe('');
            });

            test('should return sortOrderType when nullsOrderType is empty', () => {
                const model = new IndexColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC',
                    nullsOrderType: ''
                });

                expect(model.querySort()).toBe('ASC');
            });

            test('should return full sort clause when both are provided', () => {
                const model = new IndexColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: 'DESC',
                    nullsOrderType: 'LAST'
                });

                expect(model.querySort()).toBe('DESC NULLS LAST');
            });
        });
    });

    describe('toJSON', () => {
        test('should serialize with minimum values', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels
            });

            const json = model.toJSON();

            expect(json).toEqual({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    {
                        columnModelId: 'col-1'
                    }
                ]
            });
        });

        test('should serialize with all values', () => {
            const indexColumnModels = [
                new IndexColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: 'DESC',
                    nullsOrderType: 'FIRST'
                })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexOption: 'UNIQUE',
                indexType: 'BTREE',
                clustered: true,
                description: 'Test index'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    {
                        columnModelId: 'col-1',
                        sortOrderType: 'DESC',
                        nullsOrderType: 'FIRST'
                    }
                ],
                indexOption: 'UNIQUE',
                indexType: 'BTREE',
                clustered: true,
                description: 'Test index'
            });
        });

        test('should not include empty optional values in JSON', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexOption: '',
                indexType: '',
                clustered: false,
                description: ''
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('indexOption');
            expect(json).not.toHaveProperty('indexType');
            expect(json).not.toHaveProperty('clustered');
            expect(json).not.toHaveProperty('description');
        });
    });

    describe('toObject', () => {
        test('should deserialize from JSON with minimum values', () => {
            const json = {
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    {
                        columnModelId: 'col-1'
                    }
                ]
            };

            const model = TableIndexModel.toObject(json);

            expect(model).toBeInstanceOf(TableIndexModel);
            expect(model.tableIndexModelId).toBe('idx-1');
            expect(model.physicalName).toBe('test_index');
            expect(model.indexColumnModels).toHaveLength(1);
            expect(model.indexColumnModels[0]).toBeInstanceOf(IndexColumnModel);
            expect(model.indexColumnModels[0].columnModelId).toBe('col-1');
            expect(model.indexOption).toBe('');
            expect(model.indexType).toBe('');
            expect(model.clustered).toBe(false);
            expect(model.description).toBe('');
        });

        test('should deserialize from JSON with all values', () => {
            const json = {
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    {
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC',
                        nullsOrderType: 'LAST'
                    }
                ],
                indexOption: 'UNIQUE',
                indexType: 'BTREE',
                clustered: true,
                description: 'Test index'
            };

            const model = TableIndexModel.toObject(json);

            expect(model.indexOption).toBe('UNIQUE');
            expect(model.indexType).toBe('BTREE');
            expect(model.clustered).toBe(true);
            expect(model.description).toBe('Test index');
        });

        test('should handle legacy typo in indexOption field', () => {
            const json = {
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    {
                        columnModelId: 'col-1'
                    }
                ],
                indexOptioin: 'UNIQUE' // typo in field name
            };

            const model = TableIndexModel.toObject(json);

            expect(model.indexOption).toBe('UNIQUE');
        });

        test('should throw error when tableIndexModelId is missing', () => {
            const json = {
                physicalName: 'test_index',
                indexColumnModels: []
            };

            expect(() => TableIndexModel.toObject(json)).toThrow('tableIndexModelId');
        });

        test('should throw error when physicalName is missing', () => {
            const json = {
                tableIndexModelId: 'idx-1',
                indexColumnModels: []
            };

            expect(() => TableIndexModel.toObject(json)).toThrow('physicalName');
        });

        test('should throw error when indexColumnModels is missing', () => {
            const json = {
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index'
            };

            expect(() => TableIndexModel.toObject(json)).toThrow('indexColumnModels');
        });
    });

    describe('equals', () => {
        test('should return true for identical objects', () => {
            const indexColumnModels = [
                new IndexColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexOption: 'UNIQUE',
                description: 'Test'
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    })
                ],
                indexOption: 'UNIQUE',
                description: 'Test'
            });

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false for different tableIndexModelId', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-2',
                physicalName: 'test_index',
                indexColumnModels
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different physicalName', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index1',
                indexColumnModels
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index2',
                indexColumnModels
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of columns', () => {
            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({ columnModelId: 'col-1' })
                ]
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({ columnModelId: 'col-1' }),
                    new IndexColumnModel({ columnModelId: 'col-2' })
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column details', () => {
            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    })
                ]
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: 'DESC'
                    })
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different indexOption', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexOption: 'UNIQUE'
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexOption: ''
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different indexType', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexType: 'BTREE'
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                indexType: 'HASH'
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different clustered', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                clustered: true
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                clustered: false
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different descriptions', () => {
            const indexColumnModels = [
                new IndexColumnModel({ columnModelId: 'col-1' })
            ];

            const model1 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                description: 'Test 1'
            });

            const model2 = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels,
                description: 'Test 2'
            });

            expect(model1.equals(model2)).toBe(false);
        });
    });

    describe('serialization roundtrip', () => {
        test('should maintain equality after serialization and deserialization', () => {
            const original = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC',
                        nullsOrderType: 'LAST'
                    }),
                    new IndexColumnModel({
                        columnModelId: 'col-2',
                        sortOrderType: 'DESC',
                        nullsOrderType: 'FIRST'
                    })
                ],
                indexOption: 'UNIQUE',
                indexType: 'BTREE',
                clustered: true,
                description: 'Test index'
            });

            const json = original.toJSON();
            const deserialized = TableIndexModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });

        test('should handle empty values correctly in roundtrip', () => {
            const original = new TableIndexModel({
                tableIndexModelId: 'idx-1',
                physicalName: 'test_index',
                indexColumnModels: [
                    new IndexColumnModel({
                        columnModelId: 'col-1'
                    })
                ]
            });

            const json = original.toJSON();
            const deserialized = TableIndexModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });
    });

    describe('IndexColumnModel serialization', () => {
        test('should serialize and deserialize correctly', () => {
            const original = new IndexColumnModel({
                columnModelId: 'col-1',
                sortOrderType: 'ASC',
                nullsOrderType: 'LAST'
            });

            const json = original.toJSON();
            const deserialized = IndexColumnModel.toObject(json);

            expect(deserialized).toBeInstanceOf(IndexColumnModel);
            expect(original.equals(deserialized)).toBe(true);
        });

        test('should not include empty values in JSON', () => {
            const model = new IndexColumnModel({
                columnModelId: 'col-1',
                sortOrderType: '',
                nullsOrderType: ''
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnModelId: 'col-1'
            });
            expect(json).not.toHaveProperty('sortOrderType');
            expect(json).not.toHaveProperty('nullsOrderType');
        });

        test('should handle missing optional values in deserialization', () => {
            const json = {
                columnModelId: 'col-1'
            };

            const model = IndexColumnModel.toObject(json);

            expect(model.columnModelId).toBe('col-1');
            expect(model.sortOrderType).toBe('');
            expect(model.nullsOrderType).toBe('');
        });

        test('should throw error when columnModelId is missing', () => {
            const json = {
                sortOrderType: 'ASC'
            };

            expect(() => IndexColumnModel.toObject(json)).toThrow('columnModelId');
        });
    });
});