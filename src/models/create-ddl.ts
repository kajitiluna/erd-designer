import { Database } from "~/models/database";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import RelationModel from "~/models/database/RelationModel";
import { overrideColumnName } from "~/models/database/support";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

type DdlOption = {
    withTable: boolean,
    withIndex: boolean,
    withForeignKey: boolean,
    withComment: boolean,
};

export const createDdl = (erdDocument: ErdDocument, option: DdlOption) => {
    const database: Database = erdDocument.getDatabase();
    const commentWithQuery = (database.databaseType === "mysql");

    const createTableDdl = initCreateTableDdl(commentWithQuery);

    const tableQueries = createTableDdl(erdDocument, option, database);
    const indexQueries = createIndexDdl(erdDocument, option, database);
    const foreignKeyQueries = createForeignKeyDdl(erdDocument, option, database);
    const commentQueries = commentWithQuery ? [] : createCommentDdl(erdDocument, option, database);

    return [...tableQueries, ...indexQueries, ...foreignKeyQueries, ...commentQueries].join("\n");
};

type ColumnQuery = (
    columnModel: ColumnModel, columnShareModel: ColumnShareModel,
    inChildRelation: boolean, option: DdlOption, database: Database
) => string;
type TableQuery = (
    tableModel: TableModel, columnQueries: string[],
    option: DdlOption, database: Database
) => string;

const initCreateTableDdl = (commentWithQuery: boolean) => {
    const columnQuery: ColumnQuery = commentWithQuery ? columnQueryWithComment : columnQueryWithoutComment;
    const tableQuery: TableQuery = commentWithQuery ? tableQueryWithComment : tableQueryWithoutComment;

    return (erdDocument: ErdDocument, option: DdlOption, database: Database) => {
        if (option.withTable === false) {
            return [];
        }

        const tableViewModels = erdDocument.getTableViewModels();
        const queries = tableViewModels.map(tableViewModel => {
            const tableModel: TableModel = tableViewModel.tableModel;
            const allColumnModels = erdDocument.toAllColumnModels(tableModel);

            const columnQueries = allColumnModels.map(columnModel => {
                const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
                const inChildRelation = erdDocument.inChildRelation(tableModel.tableModelId, columnModel.columnModelId);

                return columnQuery(columnModel, columnShareModel, inChildRelation, option, database);
            });

            const primaryKeys = allColumnModels
                .filter(columnModel => columnModel.primaryKey === true)
                .map(columnModel => erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel)
                .map(columnShareModel => database.escape(columnShareModel.physicalName));

            if (primaryKeys.length > 0) {
                const primaryKeyQuery = `PRIMARY KEY (${primaryKeys.join(", ")})`
                columnQueries.push(primaryKeyQuery);
            }

            return `${tableQuery(tableModel, columnQueries, option, database)};\n`;
        });

        return ["/* create tables. */", ...queries, ""];
    };
};

const columnQueryWithoutComment: ColumnQuery = (
    columnModel: ColumnModel, columnShareModel: ColumnShareModel,
    inChildRelation: boolean, _: DdlOption, database: Database
) => {
    return columnShareModel.query({
        database: database,
        overridePhysicalName: columnModel.physicalName,
        notNull: columnModel.notNull,
        unique: columnModel.unique,
        defaultValue: columnModel.defaultValue,
        autoIncrement: columnModel.autoIncrement,
        inChildRelation
    });
};

const tableQueryWithoutComment: TableQuery = (
    tableModel: TableModel, columnQueries: string[], _: DdlOption, database: Database
) => {
    const physicalName = database.escape(tableModel.physicalName);
    return `CREATE TABLE ${physicalName} (\n    ${columnQueries.join(",\n    ")}\n)`;
};

const columnQueryWithComment: ColumnQuery = (
    columnModel: ColumnModel, columnShareModel: ColumnShareModel,
    inChildRelation: boolean, option: DdlOption, database: Database
) => {
    const baseQuery = columnQueryWithoutComment(columnModel, columnShareModel, inChildRelation, option, database);
    if (option.withComment === false) {
        return baseQuery
    }

    const overrideName = overrideColumnName(columnModel, columnShareModel);
    if (overrideName.physicalName === overrideName.logicalName) {
        return baseQuery;
    }

    return `${baseQuery} COMMENT '${escapeComment(overrideName.logicalName)}'`;
};

const tableQueryWithComment: TableQuery = (
    tableModel: TableModel, columnQueries: string[], option: DdlOption, database: Database
) => {
    const baseQuery = tableQueryWithoutComment(tableModel, columnQueries, option, database);
    if ((option.withComment === false) || (tableModel.logicalName === tableModel.physicalName)) {
        return baseQuery
    }

    return `${baseQuery} COMMENT '${escapeComment(tableModel.logicalName)}'`;
};

const createIndexDdl = (erViewModel: ErdDocument, option: DdlOption, database: Database) => {
    if (option.withIndex === false) {
        return [];
    }

    const tableViewModels = erViewModel.getTableViewModels();
    const queries = tableViewModels.flatMap(tableViewModel => {
        const tableModel: TableModel = tableViewModel.tableModel;

        return tableModel.tableIndexModels.map(indexModel => {
            const indexTypeQuery = indexModel.indexType ? ` USING ${indexModel.indexType}` : "";
            const columnQueries = indexModel.indexColumnModels.map(indexColumn => {
                const columnModel = erViewModel.findColumnModel(indexColumn.columnModelId) as ColumnModel;
                const columnShareModel = erViewModel.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;

                const overrideName = overrideColumnName(columnModel, columnShareModel);
                const columnName = database.escape(overrideName.physicalName);
                const sortQuery = indexColumn.querySort();

                return columnName + (sortQuery ? ` ${sortQuery}` : "");
            });

            const indexOption = indexModel.indexOption ? `${indexModel.indexOption} ` : ""
            const indexName = database.escape(indexModel.physicalName);
            const tableName = database.escape(tableModel.physicalName);

            switch (database.databaseType) {
                case "mysql":
                    return `CREATE ${indexOption}INDEX ${indexName}${indexTypeQuery}`
                        + ` ON ${tableName} (${columnQueries.join(", ")});`;
                case "postgres":
                    return `CREATE ${indexOption}INDEX ${indexName} ON ${tableName}`
                        + `${indexTypeQuery} (${columnQueries.join(", ")});`;
            }

            throw new Error(`Unsupported database type: ${database.databaseType}`);
        });
    });

    return ["/* create indexes. */", ...queries, ""];
};

const createForeignKeyDdl = (erViewModel: ErdDocument, option: DdlOption, database: Database) => {
    if (option.withForeignKey === false) {
        return [];
    }

    const relationViewModels = erViewModel.getRelationViewModels();
    const queries = relationViewModels.map(relationViewModel => {
        const relationModel: RelationModel = relationViewModel.relationModel;

        const childTableViewModel = erViewModel.findTableViewModel(relationModel.childTableModelId) as TableViewModel;
        const childTableModel = childTableViewModel.tableModel;
        const parentTableViewModel = erViewModel.findTableViewModel(relationModel.parentTableModelId) as TableViewModel;
        const parentTableModel = parentTableViewModel.tableModel;

        const pairColumnNames = relationModel.relationPairs.map(relationPair => {
            const childColumnModel = erViewModel.findColumnModel(relationPair.childColumnModelId) as ColumnModel;
            const childColumnShareModel = erViewModel.findColumnShareModel(childColumnModel.columnShareModelId) as ColumnShareModel;

            const parentColumnModel = erViewModel.findColumnModel(relationPair.parentColumnModelId) as ColumnModel;
            const parentColumnShareModel = (parentColumnModel.columnShareModelId === childColumnModel.columnShareModelId)
                ? childColumnShareModel : erViewModel.findColumnShareModel(parentColumnModel.columnShareModelId) as ColumnShareModel;

            const parentColumnName = overrideColumnName(parentColumnModel, parentColumnShareModel);
            const childColumnName = overrideColumnName(childColumnModel, childColumnShareModel);

            return {
                parent: database.escape(parentColumnName.physicalName),
                child: database.escape(childColumnName.physicalName)
            };
        });

        const parentTableName = database.escape(parentTableModel.physicalName);
        const alterQueries = [
            `ADD FOREIGN KEY (${pairColumnNames.map(pair => pair.child).join(", ")})`,
            `REFERENCES ${parentTableName} (${pairColumnNames.map(pair => pair.parent).join(", ")})`,
            `ON UPDATE ${relationModel.onUpdateAction}`,
            `ON DELETE ${relationModel.onDeleteAction}`
        ];

        const childTableName = database.escape(childTableModel.physicalName);

        return `ALTER TABLE ${childTableName}\n    ${alterQueries.join("\n    ")};\n`;
    });

    return ["/* create foreign keys. */", ...queries, ""];
};

const createCommentDdl = (erdDocument: ErdDocument, option: DdlOption, database: Database) => {
    if (option.withTable === false) {
        return [];
    }

    const tableViewModels = erdDocument.getTableViewModels();
    const queries = tableViewModels.flatMap(tableViewModel => {
        const tableModel: TableModel = tableViewModel.tableModel;

        const commentQueries = erdDocument.toAllColumnModels(tableModel)
            .map(columnModel => {
                const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
                if (columnShareModel.logicalName === columnShareModel.physicalName) {
                    return null;
                }

                const tableName = database.escape(tableModel.physicalName);
                const overrideName = overrideColumnName(columnModel, columnShareModel);
                const columnName = database.escape(overrideName.physicalName);

                return `COMMENT ON COLUMN ${tableName}.${columnName}`
                    + ` IS '${escapeComment(overrideName.logicalName)}';`;
            })
            .filter((comment): comment is string => (comment != null));

        if (tableModel.logicalName !== tableModel.physicalName) {
            const tableName = database.escape(tableModel.physicalName);
            commentQueries.unshift(`COMMENT ON TABLE ${tableName} IS '${escapeComment(tableModel.logicalName)}';`);
        }

        if (commentQueries.length > 0) {
            commentQueries.push("");
        }

        return commentQueries;
    });

    return ["/* create comments. */", ...queries, ""];
};

const escapeComment = (comment: string) => {
    return comment.replace("'", '"');
};