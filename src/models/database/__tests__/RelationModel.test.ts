import RelationModel from '../RelationModel';
import RelationPair from '../RelationPair';

describe('RelationModel', () => {
    describe('constructor', () => {
        test('should create with minimum required values', () => {
            const model = new RelationModel({
                parentTableModelId: 'parent-table',
                childTableModelId: 'child-table'
            });

            expect(model.relationModelId).toBeTruthy(); // UUID generated
            expect(model.relationName).toBe('');
            expect(model.parentTableModelId).toBe('parent-table');
            expect(model.childTableModelId).toBe('child-table');
            expect(model.parentCardinality).toBe('1');
            expect(model.childCardinality).toBe('1');
            expect(model.relationPairs).toEqual([]);
            expect(model.onUpdateAction).toBe('RESTRICT');
            expect(model.onDeleteAction).toBe('RESTRICT');
        });

        test('should create with all values', () => {
            const relationPair = new RelationPair({
                parentColumnModelId: 'parent-col',
                childColumnModelId: 'child-col'
            });

            const model = new RelationModel({
                relationModelId: 'test-id',
                relationName: 'Test Relation',
                parentTableModelId: 'parent-table',
                parentCardinality: '0..1',
                childTableModelId: 'child-table',
                childCardinality: '1..N',
                relationPairs: [relationPair],
                onUpdateAction: 'CASCADE',
                onDeleteAction: 'SET NULL'
            });

            expect(model.relationModelId).toBe('test-id');
            expect(model.relationName).toBe('Test Relation');
            expect(model.parentCardinality).toBe('0..1');
            expect(model.childCardinality).toBe('1..N');
            expect(model.relationPairs).toEqual([relationPair]);
            expect(model.onUpdateAction).toBe('CASCADE');
            expect(model.onDeleteAction).toBe('SET NULL');
        });
    });

    describe('toJSON/fromObject', () => {
        test('should serialize and deserialize correctly', () => {
            const original = new RelationModel({
                relationModelId: 'test-id',
                relationName: 'Test Relation',
                parentTableModelId: 'parent-table',
                childTableModelId: 'child-table',
                relationPairs: [
                    new RelationPair({
                        parentColumnModelId: 'parent-col',
                        childColumnModelId: 'child-col'
                    })
                ]
            });

            const json = original.toJSON();
            const deserialized = RelationModel.toObject(json);

            expect(deserialized).toBeInstanceOf(RelationModel);
            expect(deserialized.relationModelId).toBe(original.relationModelId);
            expect(deserialized.relationName).toBe(original.relationName);
            expect(deserialized.relationPairs).toHaveLength(1);
            expect(deserialized.relationPairs[0]).toBeInstanceOf(RelationPair);
        });

        test('should throw error when required properties are missing', () => {
            expect(() => RelationModel.toObject({})).toThrow();
            expect(() => RelationModel.toObject({ relationModelId: 'test' })).toThrow();
        });
    });
});