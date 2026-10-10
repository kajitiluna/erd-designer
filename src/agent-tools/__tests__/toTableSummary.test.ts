import { describe, expect, test } from 'vitest';

import DocumentBudget from '~/agent-tools/DocumentBudget';
import { toTableSummary } from '~/agent-tools/tools/tables';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import TableViewModel from '~/models/TableViewModel';
import TableModel from '~/models/database/TableModel';

const buildBudget = (rectangles: Map<string, { positionX: number, positionY: number, width: number, height: number }>) => {
    const tableModel = new TableModel({ tableModelId: 'table-1', physicalName: 'users' });
    const tableView = new TableViewModel({
        tableModel, corner: { top: 10, left: 20 },
        headerColor: {
            background: new ColorValue({ red: 255, green: 255, blue: 255 }),
            foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
        }
    });
    const erdDocument = ErdDocument.create({
        documentName: 'summary',
        erdSettingModel: ErdSettingModel.create('summary'),
        databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView]
    });
    const erdBudget = new DocumentBudget({ documentId: 'doc', uri: 'file:///summary.erd', erdDocument, rectangles });

    return { erdBudget, tableView };
};

describe('toTableSummary view.size', () => {
    test('uses the drawn rectangle when one exists', () => {
        const rectangles = new Map([['table-1', { positionX: 20, positionY: 10, width: 123, height: 45 }]]);
        const { erdBudget, tableView } = buildBudget(rectangles);

        const summary = toTableSummary(erdBudget, tableView);

        expect(summary.view.size).toEqual({ width: 123, height: 45, source: 'drawn' });
    });

    test('falls back to the estimated size without a drawn rectangle', () => {
        const { erdBudget, tableView } = buildBudget(new Map());

        const summary = toTableSummary(erdBudget, tableView);

        expect(summary.view.size.source).toBe('estimated');
        // 列なしのテーブルは空行 1 行分の高さになる。
        expect(summary.view.size.height).toBe(28 + 24);
        expect(summary.view.size.width).toBeGreaterThan(0);
    });

    test('does not store the estimated size in the budget rectangles', () => {
        const { erdBudget, tableView } = buildBudget(new Map());

        toTableSummary(erdBudget, tableView);

        expect(erdBudget.findRectangle('table-1')).toBeNull();
    });
});
