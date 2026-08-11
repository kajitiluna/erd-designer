import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadErm } from '../erm-loader';

const readFixture = (fileName: string): string => {
    return readFileSync(path.join(__dirname, 'fixtures', fileName), 'utf-8');
};

const loadSample = () => {
    const result = loadErm(readFixture('sample.erm'));
    if (result.outcome !== 'success') {
        throw new Error(`Expected the sample fixture to load successfully. summaries: ${JSON.stringify(result.summaries)}`);
    }

    return result;
};

const loadErmasterPostgresSample = () => {
    const result = loadErm(readFixture('ermaster_postgres.erm'));
    if (result.outcome !== 'success') {
        throw new Error(`Expected the ermaster_postgres fixture to load successfully. summaries: ${JSON.stringify(result.summaries)}`);
    }

    return result;
};

describe('loadErm', () => {
    test('should resolve the database and produce a success outcome', () => {
        const result = loadSample();

        expect(result.databaseType).toBe('postgres');
    });

    describe('tables', () => {
        test('should load both tables with their basic fields', () => {
            const result = loadSample();

            expect(result.tables).toHaveLength(2);
            const users = result.tables.find(table => (table.physicalName === 'users'));
            expect(users).toBeDefined();
            expect(users?.logicalName).toBe('Users');
            expect(users?.description).toBe('User accounts');
            expect(users?.schemaName).toBe('public');
            expect(users?.location).toEqual({ x: 40, y: 40 });
            expect(users?.headerColor.red).toBe(144);
        });

        test('should resolve a word-based column using the dictionary word as authoritative (spec §3.5)', () => {
            const result = loadSample();
            const users = result.tables.find(table => (table.physicalName === 'users'))!;

            const nameEntry = users.columnEntries[1];
            expect(nameEntry.kind).toBe('single');
            if (nameEntry.kind !== 'single') { return; }

            expect(nameEntry.column.physicalName).toBe('name');
            expect(nameEntry.column.description).toBe('User name');
            expect(nameEntry.column.precision).toBe('100');
            expect(nameEntry.column.columnType.baseQuery).toBe('VARCHAR[[PARAM]]');
        });

        test('should include a column_group reference as a group entry', () => {
            const result = loadSample();
            const users = result.tables.find(table => (table.physicalName === 'users'))!;

            const groupEntry = users.columnEntries[2];
            expect(groupEntry.kind).toBe('group');
            if (groupEntry.kind !== 'group') { return; }
            expect(groupEntry.ermGroupId).toBe('0');
        });

        test('should resolve a column without word_id from its own inline fields with no precision (spec §3.5)', () => {
            const result = loadSample();
            const orders = result.tables.find(table => (table.physicalName === 'orders'))!;

            const fkEntry = orders.columnEntries[1];
            expect(fkEntry.kind).toBe('single');
            if (fkEntry.kind !== 'single') { return; }

            expect(fkEntry.column.physicalName).toBe('user_id');
            expect(fkEntry.column.description).toBe('References users.id');
            expect(fkEntry.column.precision).toBe('');
            expect(fkEntry.column.columnType.baseQuery).toBe('INTEGER');
        });

        test('should load indexes, tolerating the <inidex> misspelling (spec §2.5)', () => {
            const result = loadSample();
            const users = result.tables.find(table => (table.physicalName === 'users'))!;

            expect(users.indexes).toHaveLength(1);
            expect(users.indexes[0].physicalName).toBe('uq_users_name_idx');
            expect(users.indexes[0].indexOption).toBe('UNIQUE');
            expect(users.indexes[0].columns).toEqual([{ ermColumnId: '1', descending: false }]);
        });

        test('should load a complex_unique_key_list into unique key definitions', () => {
            const result = loadSample();
            const orders = result.tables.find(table => (table.physicalName === 'orders'))!;

            expect(orders.uniqueKeys).toHaveLength(1);
            expect(orders.uniqueKeys[0].physicalName).toBe('uq_orders_dummy');
            expect(orders.uniqueKeys[0].columnIds).toEqual(['2', '3']);
        });
    });

    describe('column groups', () => {
        test('should load the column group with its own inline columns', () => {
            const result = loadSample();

            expect(result.columnGroups).toHaveLength(1);
            expect(result.columnGroups[0].groupName).toBe('audit_timestamp');
            expect(result.columnGroups[0].columns).toHaveLength(1);
            expect(result.columnGroups[0].columns[0].physicalName).toBe('created_at');
        });
    });

    describe('relations', () => {
        // 「fk_orders_user」は orders.user_id が users.id を参照する外部キー。<referenced_column> が
        // users.id (ermColumnId "0") を指すことから、<source>/<target> のどちらが親かに関わらず
        // users を親、orders を子として正しく解決できることを検証する (source/target の意味論があいまいな
        // ため、この曖昧さに依存しない実装になっているかの確認)。
        test('should resolve the parent/child tables from the referenced column, independent of source/target labeling', () => {
            const result = loadSample();

            expect(result.relations).toHaveLength(1);
            const relation = result.relations[0];
            expect(relation.relationName).toBe('fk_orders_user');
            expect(relation.parentNodeId).toBe('0');
            expect(relation.childNodeId).toBe('1');
            expect(relation.columnPairs).toEqual([{ parentErmColumnId: '0', childErmColumnId: '3' }]);
        });

        test('should map cardinalities, actions, color, and non-relative bendpoints', () => {
            const result = loadSample();
            const relation = result.relations[0];

            expect(relation.parentCardinality).toBe('1');
            expect(relation.childCardinality).toBe('1..N');
            expect(relation.onDeleteAction).toBe('CASCADE');
            expect(relation.onUpdateAction).toBe('RESTRICT');
            expect(relation.color).toEqual(expect.objectContaining({ red: 194, green: 24, blue: 91 }));
            expect(relation.edges).toEqual([{ x: 100, y: 50 }]);
        });
    });

    describe('categories', () => {
        test('should load a category with its member node ids', () => {
            const result = loadSample();

            expect(result.categories).toHaveLength(1);
            expect(result.categories[0].name).toBe('Sales');
            expect(result.categories[0].ermNodeIds).toEqual(['0', '1']);
        });
    });

    describe('unsupported databases', () => {
        test.each(['Oracle', 'DB2', 'H2', 'HSQLDB', 'MSAccess', 'StandardSQL', ''])(
            'should fail for the unsupported database "%s"',
            (database) => {
                const ermText = `<diagram><settings><database>${database}</database></settings></diagram>`;
                const result = loadErm(ermText);

                expect(result.outcome).toBe('failure');
                expect(result.summaries.some(summary => (summary.result === 'failure'))).toBe(true);
            }
        );

        test.each([
            ['MySQL', 'mysql'],
            ['PostgreSQL', 'postgres'],
            ['SQLite', 'sqlite'],
            ['SQLServer', 'ms_sqlserver'],
            ['SQLServer 2008', 'ms_sqlserver'],
        ])('should accept the supported database "%s"', (database, expectedDatabaseType) => {
            const ermText = `<diagram><settings><database>${database}</database></settings></diagram>`;
            const result = loadErm(ermText);

            expect(result.outcome).toBe('success');
            if (result.outcome !== 'success') { return; }
            expect(result.databaseType).toBe(expectedDatabaseType);
        });
    });

    describe('parse failure', () => {
        test('should return a failure outcome when the XML cannot be parsed', () => {
            const result = loadErm('not xml at all');

            expect(result.outcome).toBe('failure');
        });

        test('should return a failure outcome when the root element is not <diagram>', () => {
            const result = loadErm('<not_a_diagram></not_a_diagram>');

            expect(result.outcome).toBe('failure');
        });
    });

    describe('unsupported elements are reported but do not abort loading', () => {
        test('should record a skipped summary for views, images, and non-empty unsupported sections', () => {
            const ermText = `<diagram>
                <settings><database>MySQL</database></settings>
                <contents>
                    <view><id>0</id><physical_name>v_sales</physical_name></view>
                    <image><id>1</id></image>
                </contents>
                <sequence_set>
                    <sequence><name>seq_1</name></sequence>
                </sequence_set>
            </diagram>`;

            const result = loadErm(ermText);
            expect(result.outcome).toBe('success');

            const targets = result.summaries.map(summary => summary.target);
            expect(targets).toContain('view');
            expect(targets).toContain('image');
            expect(targets).toContain('sequence_set');
            expect(result.summaries.every(summary => (summary.result === 'skipped'))).toBe(true);
        });

        test('should not report an unsupported section when it is empty', () => {
            const ermText = `<diagram>
                <settings><database>MySQL</database></settings>
                <sequence_set></sequence_set>
            </diagram>`;

            const result = loadErm(ermText);
            expect(result.outcome).toBe('success');
            if (result.outcome !== 'success') { return; }
            expect(result.summaries).toEqual([]);
        });
    });

    describe('relation referencing a complex unique key', () => {
        test('should skip the relation with a warning (unsupported)', () => {
            const ermText = `<diagram>
                <settings><database>MySQL</database></settings>
                <contents>
                    <table>
                        <id>0</id><x>0</x><y>0</y>
                        <connections>
                            <relation>
                                <id>0</id><source>1</source><target>0</target>
                                <name>fk_x</name>
                                <referenced_complex_unique_key>0</referenced_complex_unique_key>
                            </relation>
                        </connections>
                        <physical_name>t1</physical_name>
                        <columns></columns>
                        <indexes></indexes>
                        <complex_unique_key_list></complex_unique_key_list>
                    </table>
                </contents>
            </diagram>`;

            const result = loadErm(ermText);
            expect(result.outcome).toBe('success');
            if (result.outcome !== 'success') { return; }

            expect(result.relations).toHaveLength(0);
            expect(result.summaries.some(summary =>
                (summary.result === 'warning') && summary.message.includes('complex unique key'))).toBe(true);
        });
    });

    // 実 ERMaster が出力した .erm での回帰テスト。手書きの sample.erm は FK 列に物理名/論理名を
    // 明示的に入れてしまっており、実ファイル特有の欠陥 (FK 列の名前が空で書き出される・
    // child_cardinality が "0..n"・referenced_column/relation が重複列挙される) を検出できなかった。
    describe('an actual ERMaster-produced file (ermaster_postgres.erm)', () => {
        test('should load with no warnings or failures', () => {
            const result = loadErmasterPostgresSample();

            expect(result.summaries.every(summary => (summary.result === 'success'))).toBe(true);
        });

        test('should inherit the FK column name from the referenced column when its own name is blank', () => {
            const result = loadErmasterPostgresSample();
            const userSignIn = result.tables.find(table => (table.physicalName === 'user_sign_in'))!;

            const fkEntry = userSignIn.columnEntries[1];
            expect(fkEntry.kind).toBe('single');
            if (fkEntry.kind !== 'single') { return; }

            expect(fkEntry.column.physicalName).toBe('user_id');
            expect(fkEntry.column.logicalName).toBe('ユーザID');
        });

        test('should inherit the FK column name through a chain of FK columns', () => {
            const result = loadErmasterPostgresSample();
            const favoriteMemo = result.tables.find(table => (table.physicalName === 'favorite_memo'))!;

            const [userIdEntry, shopIdEntry] = favoriteMemo.columnEntries;
            expect(userIdEntry.kind).toBe('single');
            expect(shopIdEntry.kind).toBe('single');
            if ((userIdEntry.kind !== 'single') || (shopIdEntry.kind !== 'single')) { return; }

            expect(userIdEntry.column.physicalName).toBe('user_id');
            expect(userIdEntry.column.logicalName).toBe('ユーザID');
            expect(shopIdEntry.column.physicalName).toBe('shop_id');
            expect(shopIdEntry.column.logicalName).toBe('店舗ID');
        });

        test('should map every child_cardinality "0..n" to "0..N"', () => {
            const result = loadErmasterPostgresSample();

            expect(result.relations).toHaveLength(6);
            result.relations.forEach(relation => {
                expect(relation.childCardinality).toBe('0..N');
                expect(relation.parentCardinality).toBe('1');
            });
        });

        test('should deduplicate repeated <referenced_column>/<relation> ids into a single column pair', () => {
            const result = loadErmasterPostgresSample();

            const userFavoriteRelations = result.relations.filter(relation => {
                const childTable = result.tables.find(table => (table.ermNodeId === relation.childNodeId));
                return (childTable?.physicalName === 'user_favorite');
            });

            expect(userFavoriteRelations).toHaveLength(2);
            userFavoriteRelations.forEach(relation => {
                expect(relation.columnPairs).toHaveLength(1);
            });
        });
    });

    describe('unknown relation cardinality', () => {
        test('should fall back to the default cardinality with a warning', () => {
            const ermText = `<diagram>
                <settings><database>MySQL</database></settings>
                <contents>
                    <table>
                        <id>0</id><x>0</x><y>0</y>
                        <connections></connections>
                        <physical_name>parent</physical_name>
                        <columns>
                            <normal_column><id>0</id><physical_name>id</physical_name><type>integer</type></normal_column>
                        </columns>
                        <indexes></indexes>
                        <complex_unique_key_list></complex_unique_key_list>
                    </table>
                    <table>
                        <id>1</id><x>0</x><y>0</y>
                        <connections>
                            <relation>
                                <id>0</id><source>0</source><target>1</target>
                                <name>fk_x</name>
                                <child_cardinality>2..3</child_cardinality>
                                <parent_cardinality>maybe</parent_cardinality>
                            </relation>
                        </connections>
                        <physical_name>child</physical_name>
                        <columns>
                            <normal_column>
                                <id>1</id>
                                <referenced_column>0</referenced_column>
                                <relation>0</relation>
                                <physical_name>parent_id</physical_name>
                                <type>integer</type>
                            </normal_column>
                        </columns>
                        <indexes></indexes>
                        <complex_unique_key_list></complex_unique_key_list>
                    </table>
                </contents>
            </diagram>`;

            const result = loadErm(ermText);
            expect(result.outcome).toBe('success');
            if (result.outcome !== 'success') { return; }

            expect(result.relations).toHaveLength(1);
            expect(result.relations[0].childCardinality).toBe('1..N');
            expect(result.relations[0].parentCardinality).toBe('1');
            const warnings = result.summaries.filter(summary => (summary.result === 'warning'));
            expect(warnings).toHaveLength(2);
            expect(warnings.every(warning => warning.message.includes('Unknown cardinality'))).toBe(true);
        });
    });

    describe('default value placeholder normalization (spec §5.5)', () => {
        test.each([
            ['&lt;EMPTY STRING&gt;', ''],
            ['&lt;空文字&gt;', ''],
            ['&lt;공백&gt;', ''],
            ['&lt;CURRENT TIME&gt;', 'CURRENT_TIMESTAMP'],
            ['&lt;現在日時&gt;', 'CURRENT_TIMESTAMP'],
            ['&lt;현재일자&gt;', 'CURRENT_TIMESTAMP'],
            ['literal-value', 'literal-value'],
        ])('should normalize the escaped placeholder to "%s" -> "%s"', (rawValue, expected) => {
            // <default_value> はテキストノードのため、実ファイル同様に < > は &lt; &gt; でエスケープする。
            const ermText = `<diagram>
                <settings><database>MySQL</database></settings>
                <contents>
                    <table>
                        <id>0</id><x>0</x><y>0</y>
                        <connections></connections>
                        <physical_name>t1</physical_name>
                        <columns>
                            <normal_column>
                                <id>0</id>
                                <physical_name>c1</physical_name>
                                <type>integer</type>
                                <default_value>${rawValue}</default_value>
                            </normal_column>
                        </columns>
                        <indexes></indexes>
                        <complex_unique_key_list></complex_unique_key_list>
                    </table>
                </contents>
            </diagram>`;

            const result = loadErm(ermText);
            expect(result.outcome).toBe('success');
            if (result.outcome !== 'success') { return; }

            const entry = result.tables[0].columnEntries[0];
            expect(entry.kind).toBe('single');
            if (entry.kind !== 'single') { return; }
            expect(entry.column.defaultValue).toBe(expected);
        });
    });
});
