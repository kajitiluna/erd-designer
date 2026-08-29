import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import LineViewModel from '~/models/LineViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import TableViewModel from '~/models/TableViewModel';
import { findDatabaseColumns } from '~/models/database/columns';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import RelationModel, { CardinalityType } from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableModel from '~/models/database/TableModel';

const HEADER_COLOR = { background: ColorValue.WHITE, foreground: ColorValue.BLACK };

const findColumnType = (name: string) => {
    const columnType = findDatabaseColumns('mysql').find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

const initTableViewModel = (tableModel: TableModel): TableViewModel => {
    return new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: HEADER_COLOR });
};

const initRelationViewModel = (relationModel: RelationModel): RelationViewModel => {
    return new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });
};

// 親テーブル parent(PK=id)と子テーブル child(id列のみ)を持つ最小構成。
// 各テストはこの基準に対して updateRelation を呼び、子カラムがどう変わるかを見る。
const parentIdColumn = new SimpleColumnModel({ columnModelId: 'col-parent-id', columnShareModelId: 'share-parent-id', primaryKey: true, notNull: true });
const childIdColumn = new SimpleColumnModel({ columnModelId: 'col-child-id', columnShareModelId: 'share-child-id', primaryKey: true, notNull: true });
const parentIdShare = new ColumnShareModel({ columnShareModelId: 'share-parent-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('int') });
const childIdShare = new ColumnShareModel({ columnShareModelId: 'share-child-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('int') });

const parentTableModel = new TableModel({
    tableModelId: 'table-parent', physicalName: 'parent',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-parent-id' }]
});
const childTableModelWithoutFk = new TableModel({
    tableModelId: 'table-child', physicalName: 'child',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-child-id' }]
});

// 既存カラム owner_id を子テーブルに持たせた基準(「既存カラムに紐づける」系のテストで使う)。
const existingOwnerIdColumn = new SimpleColumnModel({ columnModelId: 'col-child-owner-id', columnShareModelId: 'share-child-owner-id', notNull: false });
const existingOwnerIdShare = new ColumnShareModel({ columnShareModelId: 'share-child-owner-id', physicalName: 'owner_id', logicalName: 'owner_id', columnType: findColumnType('int') });
const childTableModelWithOwnerId = new TableModel({
    tableModelId: 'table-child', physicalName: 'child',
    columnEntries: [
        { modelType: 'single', columnModelId: 'col-child-id' },
        { modelType: 'single', columnModelId: 'col-child-owner-id' }
    ]
});

const buildDocumentWithoutFk = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'update-relation-test', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(parentTableModel), initTableViewModel(childTableModelWithoutFk)],
        columnModels: [parentIdColumn, childIdColumn],
        columnShareModels: [parentIdShare, childIdShare]
    });
};

const buildDocumentWithExistingOwnerRelation = (relationModel: RelationModel): ErdDocument => {
    return ErdDocument.create({
        documentName: 'update-relation-test', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(parentTableModel), initTableViewModel(childTableModelWithOwnerId)],
        columnModels: [parentIdColumn, childIdColumn, existingOwnerIdColumn],
        columnShareModels: [parentIdShare, childIdShare, existingOwnerIdShare],
        relationViewModels: [initRelationViewModel(relationModel)]
    });
};

const findChildColumn = (document: ErdDocument, columnModelId: string): SimpleColumnModel => {
    const columnModel = document.findColumnModel(columnModelId);
    if ((columnModel == null) || (columnModel.entityType !== 'simple')) {
        throw new Error(`simple column not found: ${columnModelId}`);
    }
    return columnModel;
};

describe('ErdDocument.updateRelation: NOT NULL derivation for the child column', () => {
    describe('creating a relation whose child column does not exist yet (new column is generated)', () => {
        test.each<[CardinalityType, boolean]>([
            ['1', true], ['1..N', true], ['0..1', false], ['0..N', false]
        ])('childCardinality "%s" makes the newly generated column notNull=%s', (childCardinality, expectedNotNull) => {
            const document = buildDocumentWithoutFk();
            const relationModel = new RelationModel({
                relationModelId: 'rel-parent-child', parentTableModelId: 'table-parent', childTableModelId: 'table-child',
                childCardinality,
                relationPairs: [new RelationPair({ parentColumnModelId: 'col-parent-id', childColumnModelId: 'col-new-fk' })]
            });

            const updated = document.updateRelation(initRelationViewModel(relationModel));

            const generatedColumn = findChildColumn(updated, 'col-new-fk');
            expect(generatedColumn.notNull).toBe(expectedNotNull);
        });
    });

    describe('linking a relation to an already-existing child column', () => {
        const ownerRelationPairs = [new RelationPair({ parentColumnModelId: 'col-parent-id', childColumnModelId: 'col-child-owner-id' })];
        const baseRelation = new RelationModel({
            relationModelId: 'rel-parent-owner', parentTableModelId: 'table-parent', childTableModelId: 'table-child',
            relationPairs: ownerRelationPairs
        });

        // relationPairs は readonly なので、上書き用のスプレッドのたびに複製し直す。
        const withCardinality = (childCardinality: CardinalityType): RelationModel => {
            return new RelationModel({ ...baseRelation, childCardinality, relationPairs: [...ownerRelationPairs] });
        };

        test('creating the relation with childCardinality "1" does not force the existing column to NOT NULL', () => {
            const document = buildDocumentWithExistingOwnerRelation(withCardinality('0..1'));
            const mandatoryRelation = withCardinality('1');
            const previousView = document.findRelationViewModel('rel-parent-owner');
            if (previousView == null) {
                throw new Error('relation view not found');
            }

            const updated = document.updateRelation(previousView.updateRelationModel(mandatoryRelation));

            expect(findChildColumn(updated, 'col-child-owner-id').notNull).toBe(false);
        });

        test('changing childCardinality on an existing relation never flips the existing column notNull', () => {
            const document = buildDocumentWithExistingOwnerRelation(withCardinality('0..1'));
            const previousView = document.findRelationViewModel('rel-parent-owner');
            if (previousView == null) {
                throw new Error('relation view not found');
            }

            const cardinalities: CardinalityType[] = ['1', '1..N', '0..1', '0..N'];
            const results = cardinalities.map(childCardinality => {
                const nextRelation = withCardinality(childCardinality);
                const updated = document.updateRelation(previousView.updateRelationModel(nextRelation));
                return findChildColumn(updated, 'col-child-owner-id').notNull;
            });

            expect(results).toEqual([false, false, false, false]);
        });

        test('updating only relationName/onUpdateAction/onDeleteAction never changes the existing column notNull', () => {
            const document = buildDocumentWithExistingOwnerRelation(baseRelation);
            const previousView = document.findRelationViewModel('rel-parent-owner');
            if (previousView == null) {
                throw new Error('relation view not found');
            }
            const nextRelation = new RelationModel({
                ...baseRelation, relationName: 'renamed', onUpdateAction: 'CASCADE', onDeleteAction: 'CASCADE',
                relationPairs: [...ownerRelationPairs]
            });

            const updated = document.updateRelation(previousView.updateRelationModel(nextRelation));

            expect(findChildColumn(updated, 'col-child-owner-id').notNull).toBe(false);
        });
    });
});

describe('ErdDocument: promoting a parent column to primary key cascades a new child column ' +
    'whose NOT NULL follows the relation\'s childCardinality', () => {
    const buildParentChildWithRelation = (childCardinality: CardinalityType): ErdDocument => {
        const parentNameColumn = new SimpleColumnModel({ columnModelId: 'col-parent-name', columnShareModelId: 'share-parent-name' });
        const parentNameShare = new ColumnShareModel({ columnShareModelId: 'share-parent-name', physicalName: 'name', logicalName: 'name', columnType: findColumnType('char') });
        const parentTableWithName = new TableModel({
            ...parentTableModel,
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-parent-id' },
                { modelType: 'single', columnModelId: 'col-parent-name' }
            ]
        });
        const relationModel = new RelationModel({
            relationModelId: 'rel-parent-child', parentTableModelId: 'table-parent', childTableModelId: 'table-child',
            childCardinality,
            relationPairs: [new RelationPair({ parentColumnModelId: 'col-parent-id', childColumnModelId: 'col-child-id' })]
        });

        return ErdDocument.create({
            documentName: 'pk-cascade-test', erdSettingModel: ErdSettingModel.create('pk-cascade-test'),
            databaseSettingModel: DatabaseSettingModel.create('mysql'), schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(parentTableWithName), initTableViewModel(childTableModelWithoutFk)],
            columnModels: [parentIdColumn, parentNameColumn, childIdColumn],
            columnShareModels: [parentIdShare, parentNameShare, childIdShare],
            relationViewModels: [initRelationViewModel(relationModel)]
        });
    };

    test.each<[CardinalityType, boolean]>([
        ['1', true], ['0..1', false]
    ])('childCardinality "%s" makes the auto-generated mirror column notNull=%s', (childCardinality, expectedNotNull) => {
        const document = buildParentChildWithRelation(childCardinality);
        const parentTableView = document.findTableViewModel('table-parent');
        if (parentTableView == null) {
            throw new Error('parent table view not found');
        }
        const namePromoted = new SimpleColumnModel({
            ...findChildColumn(document, 'col-parent-name'), primaryKey: true
        });
        const allParentColumns = document.toAllColumnsExceptStruct(parentTableView.tableModel)
            .map(column => (column.columnModelId === namePromoted.columnModelId) ? namePromoted : column);

        const updated = document.updateTableViewWithColumns(parentTableView, allParentColumns);

        const childTableView = updated.findTableViewModel('table-child');
        if (childTableView == null) {
            throw new Error('child table view not found');
        }
        const mirroredEntry = childTableView.tableModel.columnEntries.find(entry =>
            (entry.modelType === 'single') && (['col-child-id'].includes(entry.columnModelId) === false)
        );
        if ((mirroredEntry == null) || (mirroredEntry.modelType !== 'single')) {
            throw new Error('mirrored column was not generated on the child table');
        }

        expect(findChildColumn(updated, mirroredEntry.columnModelId).notNull).toBe(expectedNotNull);
    });
});
