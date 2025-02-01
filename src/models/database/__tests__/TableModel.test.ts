import TableModel from '../TableModel';
import TableIndexModel from '../TableIndexModel';
import { IndexColumnModel } from '../TableIndexModel';

describe('TableModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const model = new TableModel({});

            expect(model.tableModelId).toBeTruthy(); // UUID should be generated
            expect(model.physicalName).toBe('');
            expect(model.logicalName).toBe('');
            expect(model.columnModelIds).toEqual([]);
            expect(model.tableIndexModels).toEqual([]);
            expect(model.description).toBe('');
        });

        test('should create with provided tableModelId', () => {
            const id = 'test-id';
            const model = new TableModel({ tableModelId: id });

            expect(model.tableModelId).toBe(id);
        });

        test('should create with provided values', () => {
            const indexColumnModel = new IndexColumnModel({ columnModelId: 'col1' });
            const tableIndexModel = new TableIndexModel({
                tableIndexModelId: 'idx1',
                physicalName: 'test_idx',
                indexColumnModels: [indexColumnModel]
            });

            const options = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: ['col1', 'col2'],
                tableIndexModels: [tableIndexModel],
                description: 'Test description'
            };

            const model = new TableModel(options);

            expect(model.tableModelId).toBe(options.tableModelId);
            expect(model.physicalName).toBe(options.physicalName);
            expect(model.logicalName).toBe(options.logicalName);
            expect(model.columnModelIds).toEqual(options.columnModelIds);
            expect(model.tableIndexModels).toEqual(options.tableIndexModels);
            expect(model.description).toBe(options.description);
        });

        test('should generate new UUID when tableModelId is empty string', () => {
            const model = new TableModel({ tableModelId: '' });

            expect(model.tableModelId).toBeTruthy();
            expect(model.tableModelId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });
    });
});