import { describe, expect, test } from 'vitest';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '../TableUniqueKeysModel';

describe('TableUniqueKeysModel', () => {
    describe('constructor', () => {
        test('should create with minimum required values', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels
            });

            expect(model.tableUniqueKeysModelId).toBe('uk-1');
            expect(model.uniqueKeysColumnModels).toHaveLength(1);
            expect(model.description).toBe('');
        });

        test('should create with all options', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({
                    columnModelId: 'col-1',
                    sortOrderType: 'DESC'
                }),
                new UniqueKeysColumnModel({
                    columnModelId: 'col-2',
                    sortOrderType: 'ASC'
                })
            ];

            const model = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels,
                description: 'Test unique key constraint'
            });

            expect(model.tableUniqueKeysModelId).toBe('uk-1');
            expect(model.uniqueKeysColumnModels).toHaveLength(2);
            expect(model.description).toBe('Test unique key constraint');
        });

        test('should make uniqueKeysColumnModels readonly', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels
            });

            expect(model.uniqueKeysColumnModels).toEqual(uniqueKeysColumnModels);
            // readonly配列なので、型レベルでpushなどは禁止されている
        });
    });

    describe('UniqueKeysColumnModel', () => {
        test('should create with required values', () => {
            const model = new UniqueKeysColumnModel({
                columnModelId: 'col-1',
                sortOrderType: 'ASC'
            });

            expect(model.columnModelId).toBe('col-1');
            expect(model.sortOrderType).toBe('ASC');
        });

        test('should create with DESC sort order', () => {
            const model = new UniqueKeysColumnModel({
                columnModelId: 'col-2',
                sortOrderType: 'DESC'
            });

            expect(model.columnModelId).toBe('col-2');
            expect(model.sortOrderType).toBe('DESC');
        });

        test('should create with empty sort order', () => {
            const model = new UniqueKeysColumnModel({
                columnModelId: 'col-3',
                sortOrderType: ''
            });

            expect(model.columnModelId).toBe('col-3');
            expect(model.sortOrderType).toBe('');
        });
    });

    describe('toJSON', () => {
        test('should serialize with minimum values', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels
            });

            const json = model.toJSON();

            expect(json).toEqual({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    {
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    }
                ]
            });
        });

        test('should serialize with all values', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'DESC'
                }),
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-2',
                    sortOrderType: ''
                })
            ];

            const model = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels,
                description: 'Test description'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    {
                        columnModelId: 'col-1',
                        sortOrderType: 'DESC'
                    },
                    {
                        columnModelId: 'col-2'
                        // sortOrderType は空文字なので含まれない
                    }
                ],
                description: 'Test description'
            });
        });

        test('should not include empty description in JSON', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels,
                description: ''
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('description');
        });
    });

    describe('toObject', () => {
        test('should deserialize from JSON with minimum values', () => {
            const json = {
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    {
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    }
                ]
            };

            const model = TableUniqueKeysModel.toObject(json);

            expect(model).toBeInstanceOf(TableUniqueKeysModel);
            expect(model.tableUniqueKeysModelId).toBe('uk-1');
            expect(model.uniqueKeysColumnModels).toHaveLength(1);
            expect(model.uniqueKeysColumnModels[0]).toBeInstanceOf(UniqueKeysColumnModel);
            expect(model.uniqueKeysColumnModels[0].columnModelId).toBe('col-1');
            expect(model.uniqueKeysColumnModels[0].sortOrderType).toBe('ASC');
            expect(model.description).toBe('');
        });

        test('should deserialize from JSON with all values', () => {
            const json = {
                tableUniqueKeysModelId: 'uk-2',
                uniqueKeysColumnModels: [
                    {
                        columnModelId: 'col-1',
                        sortOrderType: 'DESC'
                    },
                    {
                        columnModelId: 'col-2'
                        // sortOrderType なし
                    }
                ],
                description: 'Test unique constraint'
            };

            const model = TableUniqueKeysModel.toObject(json);

            expect(model.tableUniqueKeysModelId).toBe('uk-2');
            expect(model.uniqueKeysColumnModels).toHaveLength(2);
            expect(model.uniqueKeysColumnModels[0].sortOrderType).toBe('DESC');
            expect(model.uniqueKeysColumnModels[1].sortOrderType).toBe('');
            expect(model.description).toBe('Test unique constraint');
        });

        test('should throw error when tableUniqueKeysModelId is missing', () => {
            const json = {
                uniqueKeysColumnModels: []
            };

            expect(() => TableUniqueKeysModel.toObject(json)).toThrow('tableUniqueKeysModelId');
        });

        test('should throw error when uniqueKeysColumnModels is missing', () => {
            const json = {
                tableUniqueKeysModelId: 'uk-1'
            };

            expect(() => TableUniqueKeysModel.toObject(json)).toThrow('uniqueKeysColumnModels');
        });
    });

    describe('equals', () => {
        test('should return true for identical objects', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model1 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels,
                description: 'Test'
            });

            const model2 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ 
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    })
                ],
                description: 'Test'
            });

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false for different tableUniqueKeysModelId', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model1 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels
            });

            const model2 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-2',
                uniqueKeysColumnModels
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of columns', () => {
            const model1 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ 
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    })
                ]
            });

            const model2 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ 
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    }),
                    new UniqueKeysColumnModel({ 
                        columnModelId: 'col-2',
                        sortOrderType: 'DESC'
                    })
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column details', () => {
            const model1 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ 
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    })
                ]
            });

            const model2 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ 
                        columnModelId: 'col-1',
                        sortOrderType: 'DESC'
                    })
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different descriptions', () => {
            const uniqueKeysColumnModels = [
                new UniqueKeysColumnModel({ 
                    columnModelId: 'col-1',
                    sortOrderType: 'ASC'
                })
            ];

            const model1 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels,
                description: 'Test 1'
            });

            const model2 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels,
                description: 'Test 2'
            });

            expect(model1.equals(model2)).toBe(false);
        });
    });

    describe('serialization roundtrip', () => {
        test('should maintain equality after serialization and deserialization', () => {
            const original = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: 'ASC'
                    }),
                    new UniqueKeysColumnModel({
                        columnModelId: 'col-2',
                        sortOrderType: 'DESC'
                    })
                ],
                description: 'Test unique constraint'
            });

            const json = original.toJSON();
            const deserialized = TableUniqueKeysModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });

        test('should handle empty values correctly in roundtrip', () => {
            const original = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-1',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({
                        columnModelId: 'col-1',
                        sortOrderType: ''
                    })
                ]
            });

            const json = original.toJSON();
            const deserialized = TableUniqueKeysModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });
    });

    describe('UniqueKeysColumnModel serialization', () => {
        test('should serialize and deserialize correctly', () => {
            const original = new UniqueKeysColumnModel({
                columnModelId: 'col-1',
                sortOrderType: 'ASC'
            });

            const json = original.toJSON();
            const deserialized = UniqueKeysColumnModel.toObject(json);

            expect(deserialized).toBeInstanceOf(UniqueKeysColumnModel);
            expect(original.equals(deserialized)).toBe(true);
        });

        test('should not include empty sortOrderType in JSON', () => {
            const model = new UniqueKeysColumnModel({
                columnModelId: 'col-1',
                sortOrderType: ''
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnModelId: 'col-1'
            });
            expect(json).not.toHaveProperty('sortOrderType');
        });

        test('should handle missing sortOrderType in deserialization', () => {
            const json = {
                columnModelId: 'col-1'
            };

            const model = UniqueKeysColumnModel.toObject(json);

            expect(model.columnModelId).toBe('col-1');
            expect(model.sortOrderType).toBe('');
        });

        test('should throw error when columnModelId is missing', () => {
            const json = {
                sortOrderType: 'ASC'
            };

            expect(() => UniqueKeysColumnModel.toObject(json)).toThrow('columnModelId');
        });
    });
});
