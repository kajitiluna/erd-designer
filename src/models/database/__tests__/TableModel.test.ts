import TableModel, { ColumnModelType } from '../TableModel';
import TableIndexModel from '../TableIndexModel';
import { IndexColumnModel } from '../TableIndexModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '../TableUniqueKeysModel';
import { PropertyNotExistsError } from '../../exceptions';

describe('TableModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const model = new TableModel({});

            expect(model.tableModelId).toBeTruthy(); // UUID should be generated
            expect(model.physicalName).toBe('');
            expect(model.logicalName).toBe('');
            expect(model.schemaId).toBe('');
            expect(model.columns).toEqual([]);
            expect(model.uniqueKeysModels).toEqual([]);
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

            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const options = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columns: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ] as ColumnModelType[],
                uniqueKeysModels: [uniqueKeysModel],
                tableIndexModels: [tableIndexModel],
                description: 'Test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            };

            const model = new TableModel(options);

            expect(model.tableModelId).toBe(options.tableModelId);
            expect(model.physicalName).toBe(options.physicalName);
            expect(model.logicalName).toBe(options.logicalName);
            expect(model.schemaId).toBe(options.schemaId);
            expect(model.columns).toEqual(options.columns);
            expect(model.uniqueKeysModels).toEqual(options.uniqueKeysModels);
            expect(model.tableIndexModels).toEqual(options.tableIndexModels);
            expect(model.description).toBe(options.description);
            expect(model.characterSet).toBe(options.characterSet);
            expect(model.collate).toBe(options.collate);
            expect(model.definitionExpression).toBe(options.definitionExpression);
            expect(model.optionExpression).toBe(options.optionExpression);
        });

        test('should generate new UUID when tableModelId is empty string', () => {
            const model = new TableModel({ tableModelId: '' });

            expect(model.tableModelId).toBeTruthy();
            expect(model.tableModelId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });

        test('should trim physicalName and logicalName', () => {
            const model = new TableModel({
                physicalName: '  test_table  ',
                logicalName: '  Test Table  '
            });

            expect(model.physicalName).toBe('test_table');
            expect(model.logicalName).toBe('Test Table');
        });

        test('should trim characterSet, collate, definitionExpression, and optionExpression', () => {
            const model = new TableModel({
                characterSet: '  utf8mb4  ',
                collate: '  utf8mb4_unicode_ci  ',
                definitionExpression: '  DEF EXPR  ',
                optionExpression: '  OPT EXPR  '
            });

            expect(model.characterSet).toBe('utf8mb4');
            expect(model.collate).toBe('utf8mb4_unicode_ci');
            expect(model.definitionExpression).toBe('DEF EXPR');
            expect(model.optionExpression).toBe('OPT EXPR');
        });

        test('should set schemaId when provided', () => {
            const schemaId = 'test-schema';
            const model = new TableModel({ schemaId });

            expect(model.schemaId).toBe(schemaId);
        });

        test('should handle group columns', () => {
            const columns = [
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' }
            ] as ColumnModelType[];

            const model = new TableModel({ columns });

            expect(model.columns).toEqual(columns);
        });
    });

    describe('addColumnModelIds', () => {
        test('should add new column model ids', () => {
            const existingColumns = [
                { modelType: 'single', columnModelId: 'col1' }
            ] as ColumnModelType[];
            const model = new TableModel({ columns: existingColumns });

            const result = model.addColumnModelIds(['col2', 'col3']);

            expect(result.columns).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'single', columnModelId: 'col2' },
                { modelType: 'single', columnModelId: 'col3' }
            ]);
        });

        test('should not add duplicate column model ids', () => {
            const existingColumns = [
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'single', columnModelId: 'col2' }
            ] as ColumnModelType[];
            const model = new TableModel({ columns: existingColumns });

            const result = model.addColumnModelIds(['col1', 'col3']);

            expect(result.columns).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'single', columnModelId: 'col2' },
                { modelType: 'single', columnModelId: 'col3' }
            ]);
        });

        test('should return same instance when no new columns to add', () => {
            const existingColumns = [
                { modelType: 'single', columnModelId: 'col1' }
            ] as ColumnModelType[];
            const model = new TableModel({ columns: existingColumns });

            const result = model.addColumnModelIds(['col1']);

            expect(result).toBe(model);
        });

        test('should return same instance when adding empty array', () => {
            const model = new TableModel({});

            const result = model.addColumnModelIds([]);

            expect(result).toBe(model);
        });

        test('should preserve other properties when adding columns', () => {
            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const originalData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columns: [{ modelType: 'single', columnModelId: 'col1' }] as ColumnModelType[],
                uniqueKeysModels: [uniqueKeysModel],
                description: 'Test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            };
            const model = new TableModel(originalData);

            const result = model.addColumnModelIds(['col2']);

            expect(result.tableModelId).toBe(originalData.tableModelId);
            expect(result.physicalName).toBe(originalData.physicalName);
            expect(result.logicalName).toBe(originalData.logicalName);
            expect(result.schemaId).toBe(originalData.schemaId);
            expect(result.uniqueKeysModels).toEqual(originalData.uniqueKeysModels);
            expect(result.description).toBe(originalData.description);
            expect(result.characterSet).toBe(originalData.characterSet);
            expect(result.collate).toBe(originalData.collate);
            expect(result.definitionExpression).toBe(originalData.definitionExpression);
            expect(result.optionExpression).toBe(originalData.optionExpression);
        });

        test('should handle columns with group types correctly', () => {
            const existingColumns = [
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' }
            ] as ColumnModelType[];
            const model = new TableModel({ columns: existingColumns });

            const result = model.addColumnModelIds(['col1', 'col2']);

            expect(result.columns).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' },
                { modelType: 'single', columnModelId: 'col2' }
            ]);
        });
    });

    describe('equals', () => {
        test('should return true for identical models', () => {
            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const data = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columns: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' }
                ] as ColumnModelType[],
                uniqueKeysModels: [uniqueKeysModel],
                description: 'Test description'
            };
            const model1 = new TableModel(data);
            const model2 = new TableModel(data);

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false for different tableModelId', () => {
            const model1 = new TableModel({ tableModelId: 'id1' });
            const model2 = new TableModel({ tableModelId: 'id2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different physicalName', () => {
            const model1 = new TableModel({ physicalName: 'table1' });
            const model2 = new TableModel({ physicalName: 'table2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different logicalName', () => {
            const model1 = new TableModel({ logicalName: 'Table 1' });
            const model2 = new TableModel({ logicalName: 'Table 2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different schemaId', () => {
            const model1 = new TableModel({ schemaId: 'schema1' });
            const model2 = new TableModel({ schemaId: 'schema2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of columns', () => {
            const model1 = new TableModel({
                columns: [{ modelType: 'single', columnModelId: 'col1' }] as ColumnModelType[]
            });
            const model2 = new TableModel({
                columns: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ] as ColumnModelType[]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column model types', () => {
            const model1 = new TableModel({
                columns: [{ modelType: 'single', columnModelId: 'col1' }] as ColumnModelType[]
            });
            const model2 = new TableModel({
                columns: [{ modelType: 'group', columnGroupId: 'col1' }] as ColumnModelType[]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different single column model ids', () => {
            const model1 = new TableModel({
                columns: [{ modelType: 'single', columnModelId: 'col1' }] as ColumnModelType[]
            });
            const model2 = new TableModel({
                columns: [{ modelType: 'single', columnModelId: 'col2' }] as ColumnModelType[]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different group column ids', () => {
            const model1 = new TableModel({
                columns: [{ modelType: 'group', columnGroupId: 'group1' }] as ColumnModelType[]
            });
            const model2 = new TableModel({
                columns: [{ modelType: 'group', columnGroupId: 'group2' }] as ColumnModelType[]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of unique keys models', () => {
            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const model1 = new TableModel({ uniqueKeysModels: [] });
            const model2 = new TableModel({ uniqueKeysModels: [uniqueKeysModel] });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different unique keys models', () => {
            const uniqueKeysColumnModel1 = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel1 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel1]
            });

            const uniqueKeysColumnModel2 = new UniqueKeysColumnModel({
                columnModelId: 'col2',
                sortOrderType: 'DESC'
            });
            const uniqueKeysModel2 = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk2',
                uniqueKeysColumnModels: [uniqueKeysColumnModel2]
            });

            const model1 = new TableModel({ uniqueKeysModels: [uniqueKeysModel1] });
            const model2 = new TableModel({ uniqueKeysModels: [uniqueKeysModel2] });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of table index models', () => {
            const indexColumnModel = new IndexColumnModel({ columnModelId: 'col1' });
            const tableIndexModel = new TableIndexModel({
                tableIndexModelId: 'idx1',
                physicalName: 'test_idx',
                indexColumnModels: [indexColumnModel]
            });

            const model1 = new TableModel({ tableIndexModels: [] });
            const model2 = new TableModel({ tableIndexModels: [tableIndexModel] });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different table index models', () => {
            const indexColumnModel1 = new IndexColumnModel({ columnModelId: 'col1' });
            const tableIndexModel1 = new TableIndexModel({
                tableIndexModelId: 'idx1',
                physicalName: 'test_idx1',
                indexColumnModels: [indexColumnModel1]
            });

            const indexColumnModel2 = new IndexColumnModel({ columnModelId: 'col2' });
            const tableIndexModel2 = new TableIndexModel({
                tableIndexModelId: 'idx2',
                physicalName: 'test_idx2',
                indexColumnModels: [indexColumnModel2]
            });

            const model1 = new TableModel({ tableIndexModels: [tableIndexModel1] });
            const model2 = new TableModel({ tableIndexModels: [tableIndexModel2] });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different descriptions', () => {
            const model1 = new TableModel({ description: 'Description 1' });
            const model2 = new TableModel({ description: 'Description 2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different characterSet', () => {
            const model1 = new TableModel({ characterSet: 'utf8mb4' });
            const model2 = new TableModel({ characterSet: 'utf8' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different collate', () => {
            const model1 = new TableModel({ collate: 'utf8mb4_unicode_ci' });
            const model2 = new TableModel({ collate: 'utf8mb4_general_ci' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different definitionExpression', () => {
            const model1 = new TableModel({ definitionExpression: 'EXPR 1' });
            const model2 = new TableModel({ definitionExpression: 'EXPR 2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different optionExpression', () => {
            const model1 = new TableModel({ optionExpression: 'OPT 1' });
            const model2 = new TableModel({ optionExpression: 'OPT 2' });

            expect(model1.equals(model2)).toBe(false);
        });
    });

    describe('toJSON', () => {
        test('should serialize model with all properties', () => {
            const indexColumnModel = new IndexColumnModel({ columnModelId: 'col1' });
            const tableIndexModel = new TableIndexModel({
                tableIndexModelId: 'idx1',
                physicalName: 'test_idx',
                indexColumnModels: [indexColumnModel]
            });

            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const model = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columns: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' }
                ] as ColumnModelType[],
                uniqueKeysModels: [uniqueKeysModel],
                tableIndexModels: [tableIndexModel],
                description: 'Test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            });

            const json = model.toJSON();

            expect(json).toEqual({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columnModelIds: ['col1', 'group:group1'],
                uniqueKeysModels: [uniqueKeysModel.toJSON()],
                tableIndexModels: [tableIndexModel.toJSON()],
                description: 'Test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            });
        });

        test('should omit empty schemaId from JSON', () => {
            const model = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: ''
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('schemaId');
            expect(json).toEqual({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: []
            });
        });

        test('should omit empty description from JSON', () => {
            const model = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                description: ''
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('description');
        });

        test('should handle group columns in columnModelIds', () => {
            const model = new TableModel({
                columns: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ] as ColumnModelType[]
            });

            const json = model.toJSON();

            expect(json.columnModelIds).toEqual(['col1', 'group:group1', 'col2']);
        });

        test('should omit empty uniqueKeysModels and tableIndexModels from JSON', () => {
            const model = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                uniqueKeysModels: [],
                tableIndexModels: []
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('uniqueKeysModels');
            expect(json).not.toHaveProperty('tableIndexModels');
        });

        test('should omit empty characterSet, collate, definitionExpression, and optionExpression from JSON', () => {
            const model = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table'
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('characterSet');
            expect(json).not.toHaveProperty('collate');
            expect(json).not.toHaveProperty('definitionExpression');
            expect(json).not.toHaveProperty('optionExpression');
        });

        test('should include characterSet, collate, definitionExpression, and optionExpression in JSON when set', () => {
            const model = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            });

            const json = model.toJSON();

            expect(json.characterSet).toBe('utf8mb4');
            expect(json.collate).toBe('utf8mb4_unicode_ci');
            expect(json.definitionExpression).toBe('DEF EXPR');
            expect(json.optionExpression).toBe('OPT EXPR');
        });
    });

    describe('toObject', () => {
        test('should deserialize from JSON object', () => {
            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const jsonData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columnModelIds: ['col1', 'group:group1'],
                uniqueKeysModels: [uniqueKeysModel.toJSON()],
                tableIndexModels: [],
                description: 'Test description'
            };

            const model = TableModel.toObject(jsonData);

            expect(model.tableModelId).toBe('test-id');
            expect(model.physicalName).toBe('test_table');
            expect(model.logicalName).toBe('Test Table');
            expect(model.schemaId).toBe('test-schema');
            expect(model.columns).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' }
            ]);
            expect(model.uniqueKeysModels).toHaveLength(1);
            expect(model.uniqueKeysModels[0].equals(uniqueKeysModel)).toBe(true);
            expect(model.description).toBe('Test description');
        });

        test('should handle missing optional properties', () => {
            const jsonData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: []
            };

            const model = TableModel.toObject(jsonData);

            expect(model.schemaId).toBe('');
            expect(model.uniqueKeysModels).toEqual([]);
            expect(model.tableIndexModels).toEqual([]);
            expect(model.description).toBe('');
            expect(model.characterSet).toBe('');
            expect(model.collate).toBe('');
            expect(model.definitionExpression).toBe('');
            expect(model.optionExpression).toBe('');
        });

        test('should throw PropertyNotExistsError for missing required properties', () => {
            expect(() => {
                TableModel.toObject({});
            }).toThrow(PropertyNotExistsError);

            expect(() => {
                TableModel.toObject({ tableModelId: 'test-id' });
            }).toThrow(PropertyNotExistsError);

            expect(() => {
                TableModel.toObject({ 
                    tableModelId: 'test-id',
                    physicalName: 'test_table'
                });
            }).toThrow(PropertyNotExistsError);

            expect(() => {
                TableModel.toObject({ 
                    tableModelId: 'test-id',
                    physicalName: 'test_table',
                    logicalName: 'Test Table'
                });
            }).toThrow(PropertyNotExistsError);
        });

        test('should parse group column ids correctly', () => {
            const jsonData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: ['col1', 'group:group1', 'col2', 'group:group2']
            };

            const model = TableModel.toObject(jsonData);

            expect(model.columns).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' },
                { modelType: 'single', columnModelId: 'col2' },
                { modelType: 'group', columnGroupId: 'group2' }
            ]);
        });

        test('should handle table index models deserialization', () => {
            const indexColumnModel = new IndexColumnModel({ columnModelId: 'col1' });
            const tableIndexModel = new TableIndexModel({
                tableIndexModelId: 'idx1',
                physicalName: 'test_idx',
                indexColumnModels: [indexColumnModel]
            });

            const jsonData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: ['col1'],
                tableIndexModels: [tableIndexModel.toJSON()]
            };

            const model = TableModel.toObject(jsonData);

            expect(model.tableIndexModels.length).toBe(1);
            expect(model.tableIndexModels[0].equals(tableIndexModel)).toBe(true);
        });

        test('should handle unique keys models deserialization', () => {
            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const jsonData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: ['col1'],
                uniqueKeysModels: [uniqueKeysModel.toJSON()]
            };

            const model = TableModel.toObject(jsonData);

            expect(model.uniqueKeysModels).toHaveLength(1);
            expect(model.uniqueKeysModels[0].equals(uniqueKeysModel)).toBe(true);
        });

        test('should deserialize characterSet, collate, definitionExpression, and optionExpression', () => {
            const jsonData = {
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                columnModelIds: [],
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            };

            const model = TableModel.toObject(jsonData);

            expect(model.characterSet).toBe('utf8mb4');
            expect(model.collate).toBe('utf8mb4_unicode_ci');
            expect(model.definitionExpression).toBe('DEF EXPR');
            expect(model.optionExpression).toBe('OPT EXPR');
        });
    });

    describe('serialization roundtrip', () => {
        test('should maintain equality after serialization and deserialization', () => {
            const uniqueKeysColumnModel = new UniqueKeysColumnModel({
                columnModelId: 'col1',
                sortOrderType: 'ASC'
            });
            const uniqueKeysModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk1',
                uniqueKeysColumnModels: [uniqueKeysColumnModel]
            });

            const indexColumnModel = new IndexColumnModel({ columnModelId: 'col1' });
            const tableIndexModel = new TableIndexModel({
                tableIndexModelId: 'idx1',
                physicalName: 'test_idx',
                indexColumnModels: [indexColumnModel]
            });

            const original = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table',
                schemaId: 'test-schema',
                columns: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' }
                ] as ColumnModelType[],
                uniqueKeysModels: [uniqueKeysModel],
                tableIndexModels: [tableIndexModel],
                description: 'Test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                definitionExpression: 'DEF EXPR',
                optionExpression: 'OPT EXPR'
            });

            const json = original.toJSON();
            const deserialized = TableModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });

        test('should handle empty values correctly in roundtrip', () => {
            const original = new TableModel({
                tableModelId: 'test-id',
                physicalName: 'test_table',
                logicalName: 'Test Table'
            });

            const json = original.toJSON();
            const deserialized = TableModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });
    });
});