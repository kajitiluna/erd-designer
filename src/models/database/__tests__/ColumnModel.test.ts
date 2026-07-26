import ColumnModel from '../ColumnModel';
import SimpleColumnModel from '../SimpleColumnModel';
import StructColumnModel from '../StructColumnModel';

describe('SimpleColumnModel', () => {
    describe('constructor', () => {
        test('should create with default values', () => {
            const model = new SimpleColumnModel({ columnShareModelId: '' });

            expect(model.columnModelId).toBeTruthy(); // UUID generated
            expect(model.columnShareModelId).toBe('');
            expect(model.primaryKey).toBe(false);
            expect(model.notNull).toBe(false);
            expect(model.unique).toBe(false);
            expect(model.autoIncrement).toBe(false);
            expect(model.entityType).toBe('simple');
        });

        test('should create with provided values', () => {
            const options = {
                columnModelId: 'test-id',
                columnShareModelId: 'share-id',
                primaryKey: true,
                notNull: true,
                unique: true,
                autoIncrement: true
            };

            const model = new SimpleColumnModel(options);

            expect(model.columnModelId).toBe('test-id');
            expect(model.columnShareModelId).toBe('share-id');
            expect(model.primaryKey).toBe(true);
            expect(model.notNull).toBe(true);
            expect(model.unique).toBe(true);
            expect(model.autoIncrement).toBe(true);
            expect(model.entityType).toBe('simple');
        });
    });

    describe('spread copy compatibility', () => {
        test('should keep all simple attributes on spread copy', () => {
            const original = new SimpleColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id',
                physicalName: 'name',
                logicalName: '名前',
                primaryKey: true,
                notNull: true,
                unique: true,
                autoIncrement: true,
                defaultValue: 'abc'
            });

            const copied = new SimpleColumnModel({ ...original });

            expect(copied.equals(original)).toBe(true);
        });

        test('should override only notNull on simple spread copy', () => {
            const original = new SimpleColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id',
                primaryKey: true,
                notNull: false,
                defaultValue: 'abc'
            });

            const copied = new SimpleColumnModel({ ...original, notNull: true });

            expect(copied.notNull).toBe(true);
            expect(copied.columnShareModelId).toBe('share-id');
            expect(copied.primaryKey).toBe(true);
            expect(copied.defaultValue).toBe('abc');
        });

        test('should apply explicit false override on spread copy', () => {
            const original = new SimpleColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id',
                primaryKey: true
            });

            const copied = new SimpleColumnModel({ ...original, primaryKey: false });

            expect(copied.primaryKey).toBe(false);
            expect(copied.columnShareModelId).toBe('share-id');
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const model = new SimpleColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id'
            });
        });

        test('should not output entityType key for simple variant', () => {
            const model = new SimpleColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id',
                primaryKey: true
            });

            const json = model.toJSON();

            expect('entityType' in json).toBe(false);
            expect('structColumnShareModelId' in json).toBe(false);
        });
    });

    describe('equals', () => {
        test('should detect variant difference with same common attributes', () => {
            const simpleModel = new SimpleColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: ''
            });
            const structModel = new StructColumnModel({
                columnModelId: 'test-id',
                structShareModelId: 'struct-id'
            });

            expect(ColumnModel.equals(simpleModel, structModel)).toBe(false);
        });
    });
});

describe('StructColumnModel', () => {
    describe('constructor', () => {
        test('should create struct variant with its own attributes', () => {
            const model = new StructColumnModel({
                columnModelId: 'test-id',
                physicalName: 'address',
                logicalName: '住所',
                notNull: true,
                structShareModelId: 'struct-id'
            });

            expect(model.columnModelId).toBe('test-id');
            expect(model.entityType).toBe('struct');
            expect(model.structShareModelId).toBe('struct-id');
            expect(model.physicalName).toBe('address');
            expect(model.logicalName).toBe('住所');
            expect(model.notNull).toBe(true);
        });
    });

    describe('spread copy compatibility', () => {
        test('should keep struct variant on spread copy', () => {
            const original = new StructColumnModel({
                columnModelId: 'test-id',
                physicalName: 'address',
                structShareModelId: 'struct-id'
            });

            const copied = new StructColumnModel({ ...original });

            expect(copied.entityType).toBe('struct');
            expect(copied.structShareModelId).toBe('struct-id');
            expect(copied.equals(original)).toBe(true);
        });

        test('should keep struct variant on spread copy with notNull override', () => {
            const original = new StructColumnModel({
                columnModelId: 'test-id',
                structShareModelId: 'struct-id',
                notNull: false
            });

            const copied = new StructColumnModel({ ...original, notNull: true });

            expect(copied.entityType).toBe('struct');
            expect(copied.structShareModelId).toBe('struct-id');
            expect(copied.notNull).toBe(true);
        });
    });

    describe('toJSON', () => {
        test('should output entityType and structColumnShareModelId for struct variant', () => {
            const model = new StructColumnModel({
                columnModelId: 'test-id',
                physicalName: 'address',
                notNull: true,
                structShareModelId: 'struct-id'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnModelId: 'test-id',
                entityType: 'struct',
                structShareModelId: 'struct-id',
                physicalName: 'address',
                notNull: true
            });
            expect('columnShareModelId' in json).toBe(false);
        });
    });

    describe('equals', () => {
        test('should detect structColumnShareModelId difference between struct variants', () => {
            const first = new StructColumnModel({
                columnModelId: 'test-id',
                structShareModelId: 'struct-a'
            });
            const second = new StructColumnModel({
                columnModelId: 'test-id',
                structShareModelId: 'struct-b'
            });

            expect(first.equals(second)).toBe(false);
        });
    });
});

describe('ColumnModel.isSimpleColumn / ColumnModel.isStructColumn', () => {
    test('should narrow simple variant', () => {
        const model = new SimpleColumnModel({ columnShareModelId: 'share-id' });

        expect(ColumnModel.isSimpleColumn(model)).toBe(true);
        expect(ColumnModel.isStructColumn(model)).toBe(false);
    });

    test('should narrow struct variant', () => {
        const model = new StructColumnModel({ structShareModelId: 'struct-id' });

        expect(ColumnModel.isSimpleColumn(model)).toBe(false);
        expect(ColumnModel.isStructColumn(model)).toBe(true);
    });
});

describe('ColumnModel.toObject', () => {
    test('should convert from plain object', () => {
        const obj = {
            columnModelId: 'test-id',
            columnShareModelId: 'share-id',
            primaryKey: true,
            notNull: true,
            unique: true,
            autoIncrement: true
        };

        const model = ColumnModel.toObject(obj);

        expect(model).toBeInstanceOf(SimpleColumnModel);
        expect(model.columnModelId).toBe('test-id');
        expect(ColumnModel.isSimpleColumn(model) && model.columnShareModelId).toBe('share-id');
        expect(ColumnModel.isSimpleColumn(model) && model.primaryKey).toBe(true);
        expect(model.notNull).toBe(true);
        expect(ColumnModel.isSimpleColumn(model) && model.unique).toBe(true);
        expect(ColumnModel.isSimpleColumn(model) && model.autoIncrement).toBe(true);
        expect(model.entityType).toBe('simple');
    });

    test('should throw error when required properties are missing', () => {
        expect(() => ColumnModel.toObject({})).toThrow();
        expect(() => ColumnModel.toObject({ columnModelId: 'test-id' })).toThrow();
    });

    test('should convert struct variant from plain object', () => {
        const obj = {
            columnModelId: 'test-id',
            entityType: 'struct',
            structShareModelId: 'struct-id',
            physicalName: 'address',
            notNull: true
        };

        const model = ColumnModel.toObject(obj);

        expect(model).toBeInstanceOf(StructColumnModel);
        expect(model.entityType).toBe('struct');
        expect(ColumnModel.isStructColumn(model) && model.structShareModelId).toBe('struct-id');
        expect(model.physicalName).toBe('address');
        expect(model.notNull).toBe(true);
    });

    test('should throw error when struct variant misses structColumnShareModelId', () => {
        const obj = {
            columnModelId: 'test-id',
            entityType: 'struct'
        };

        expect(() => ColumnModel.toObject(obj)).toThrow();
    });

    test('should roundtrip simple variant through toJSON', () => {
        const original = new SimpleColumnModel({
            columnModelId: 'test-id',
            columnShareModelId: 'share-id',
            physicalName: 'name',
            primaryKey: true,
            defaultValue: 'abc'
        });

        const restored = ColumnModel.toObject(original.toJSON());

        expect(ColumnModel.equals(restored, original)).toBe(true);
    });

    test('should roundtrip struct variant through toJSON', () => {
        const original = new StructColumnModel({
            columnModelId: 'test-id',
            physicalName: 'address',
            notNull: true,
            structShareModelId: 'struct-id'
        });

        const restored = ColumnModel.toObject(original.toJSON());

        expect(ColumnModel.equals(restored, original)).toBe(true);
    });
});
