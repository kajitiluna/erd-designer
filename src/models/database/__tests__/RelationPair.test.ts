import RelationPair from '../RelationPair';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('RelationPair', () => {
    describe('constructor', () => {
        test('should create with required values', () => {
            const pair = new RelationPair({
                parentColumnModelId: 'parent-id',
                childColumnModelId: 'child-id'
            });

            expect(pair.parentColumnModelId).toBe('parent-id');
            expect(pair.childColumnModelId).toBe('child-id');
        });
    });

    describe('serialization', () => {
        test('should serialize to JSON', () => {
            const pair = new RelationPair({
                parentColumnModelId: 'parent-id',
                childColumnModelId: 'child-id'
            });

            const json = pair.toJSON();
            expect(json).toEqual({
                parentColumnModelId: 'parent-id',
                childColumnModelId: 'child-id'
            });
        });

        test('should deserialize from object', () => {
            const obj = {
                parentColumnModelId: 'parent-id',
                childColumnModelId: 'child-id'
            };

            const pair = RelationPair.toObject(obj);
            expect(pair).toBeInstanceOf(RelationPair);
            expect(pair.parentColumnModelId).toBe('parent-id');
            expect(pair.childColumnModelId).toBe('child-id');
        });

        test('should throw error when parentColumnModelId is missing', () => {
            const obj = {
                childColumnModelId: 'child-id'
            };

            expect(() => RelationPair.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when childColumnModelId is missing', () => {
            const obj = {
                parentColumnModelId: 'parent-id'
            };

            expect(() => RelationPair.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});