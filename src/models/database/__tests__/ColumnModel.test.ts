import ColumnModel from '../ColumnModel';

describe('ColumnModel', () => {
    describe('constructor', () => {
        test('should create with default values', () => {
            const model = new ColumnModel({});

            expect(model.columnModelId).toBeTruthy(); // UUID generated
            expect(model.columnShareModelId).toBe('');
            expect(model.primaryKey).toBe(false);
            expect(model.notNull).toBe(false);
            expect(model.unique).toBe(false);
            expect(model.autoIncrement).toBe(false);
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

            const model = new ColumnModel(options);

            expect(model.columnModelId).toBe('test-id');
            expect(model.columnShareModelId).toBe('share-id');
            expect(model.primaryKey).toBe(true);
            expect(model.notNull).toBe(true);
            expect(model.unique).toBe(true);
            expect(model.autoIncrement).toBe(true);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const model = new ColumnModel({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnModelId: 'test-id',
                columnShareModelId: 'share-id'
            });
        });
    });

    describe('toObject', () => {
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

            expect(model).toBeInstanceOf(ColumnModel);
            expect(model.columnModelId).toBe('test-id');
            expect(model.columnShareModelId).toBe('share-id');
            expect(model.primaryKey).toBe(true);
            expect(model.notNull).toBe(true);
            expect(model.unique).toBe(true);
            expect(model.autoIncrement).toBe(true);
        });

        test('should throw error when required properties are missing', () => {
            expect(() => ColumnModel.toObject({})).toThrow();
            expect(() => ColumnModel.toObject({ columnModelId: 'test-id' })).toThrow();
        });
    });
});