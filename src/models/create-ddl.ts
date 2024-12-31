import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import RelationModel from "~/models/database/RelationModel";
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
    const databaseType = erdDocument.databaseSettingModel.databaseType;
    const commentWithQuery = (databaseType === "mysql");

    const createTableDdl = initCreateTableDdl(commentWithQuery);

    const tableQueries = createTableDdl(erdDocument, option);
    const indexQueries = createIndexDdl(erdDocument, option);
    const foreignKeyQueries = createForeignKeyDdl(erdDocument, option);
    const commentQueries = commentWithQuery ? [] : createCommentDdl(erdDocument, option);

    return [...tableQueries, ...indexQueries, ...foreignKeyQueries, ...commentQueries].join("\n");
};

type ColumnQuery = (columnModel: ColumnModel, columnShareModel: ColumnShareModel, option: DdlOption) => string;
type TableQuery = (tableModel: TableModel, columnQueries: string[], option: DdlOption) => string;

const initCreateTableDdl = (commentWithQuery: boolean) => {
    const columnQuery: ColumnQuery = commentWithQuery ? columnQueryWithComment : columnQueryWithoutComment;
    const tableQuery: TableQuery = commentWithQuery ? tableQueryWithComment : tableQueryWithoutComment;

    return (erViewModel: ErdDocument, option: DdlOption) => {
        if (option.withTable === false) {
            return [];
        }

        const tableViewModels = erViewModel.getTableViewModels();
        const queries = tableViewModels.map(tableViewModel => {
            const tableModel: TableModel = tableViewModel.tableModel;
            const columnQueries = tableModel.columnModelIds.map(columnModelId => {
                const columnModel = erViewModel.findColumnModel(columnModelId) as ColumnModel;
                const columnShareModel = erViewModel.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;

                return columnQuery(columnModel, columnShareModel, option);
            });

            const primaryKeys = tableModel.columnModelIds
                .map(columnModelId => erViewModel.findColumnModel(columnModelId) as ColumnModel)
                .filter(columnModel => columnModel.primaryKey === true)
                .map(columnModel => erViewModel.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel)
                .map(columnShareModel => columnShareModel.physicalName);

            if (primaryKeys.length > 0) {
                const primaryKeyQuery = `PRIMARY KEY (${primaryKeys.join(", ")})`
                columnQueries.push(primaryKeyQuery);
            }

            return `${tableQuery(tableModel, columnQueries, option)};\n`;
        });

        return ["/* create tables. */", ...queries, ""];
    };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const columnQueryWithoutComment: ColumnQuery = (columnModel: ColumnModel, columnShareModel: ColumnShareModel, _: DdlOption) => {
    return columnShareModel.query({
        notNull: columnModel.notNull,
        autoIncrement: columnModel.autoIncrement
    });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const tableQueryWithoutComment: TableQuery = (tableModel: TableModel, columnQueries: string[], _: DdlOption) => {
    return `CREATE TABLE ${tableModel.physicalName} (\n    ${columnQueries.join(",\n    ")}\n)`;
};

const columnQueryWithComment: ColumnQuery = (columnModel: ColumnModel, columnShareModel: ColumnShareModel, option: DdlOption) => {
    const baseQuery = columnQueryWithoutComment(columnModel, columnShareModel, option);
    if ((option.withComment === false) || (columnShareModel.logicalName === columnShareModel.physicalName)) {
        return baseQuery
    }

    return `${baseQuery} COMMENT '${escapeComment(columnShareModel.logicalName)}'`;
};

const tableQueryWithComment: TableQuery = (tableModel: TableModel, columnQueries: string[], option: DdlOption) => {
    const baseQuery = tableQueryWithoutComment(tableModel, columnQueries, option);
    if ((option.withComment === false) || (tableModel.logicalName === tableModel.physicalName)) {
        return baseQuery
    }

    return `${baseQuery} COMMENT '${escapeComment(tableModel.logicalName)}'`;
};

const createIndexDdl = (erViewModel: ErdDocument, option: DdlOption) => {
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

                const sortQuery = indexColumn.querySort();
                return columnShareModel.physicalName + (sortQuery ? ` ${sortQuery}` : "");
            });

            return `CREATE ${indexModel.indexOptioin} INDEX ${indexModel.physicalName}${indexTypeQuery}`
                + ` ON ${tableModel.physicalName} (${columnQueries.join(", ")});`;
        });
    });

    return ["/* create indexes. */", ...queries, ""];
};

const createForeignKeyDdl = (erViewModel: ErdDocument, option: DdlOption) => {
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

            return { parent: parentColumnShareModel.physicalName, child: childColumnShareModel.physicalName };
        });

        const alterQueries = [
            `ADD FOREIGN KEY (${pairColumnNames.map(pair => pair.child).join(", ")})`,
            `REFERENCES ${parentTableModel.physicalName} (${pairColumnNames.map(pair => pair.parent).join(", ")})`,
            `ON UPDATE ${relationModel.onUpdateAction}`,
            `ON DELETE ${relationModel.onDeleteAction}`
        ];

        return `ALTER TABLE ${childTableModel.physicalName}\n    ${alterQueries.join("\n    ")};\n`;
    });

    return ["/* create foreign keys. */", ...queries, ""];
};

const createCommentDdl = (erViewModel: ErdDocument, option: DdlOption) => {
    if (option.withTable === false) {
        return [];
    }

    const tableViewModels = erViewModel.getTableViewModels();
    const queries = tableViewModels.flatMap(tableViewModel => {
        const tableModel: TableModel = tableViewModel.tableModel;

        const commentQueries = tableModel.columnModelIds
            .map(columnModelId => {
                const columnModel = erViewModel.findColumnModel(columnModelId) as ColumnModel;
                const columnShareModel = erViewModel.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
                if (columnShareModel.logicalName === columnShareModel.physicalName) {
                    return null;
                }

                return `COMMENT ON COLUMN ${tableModel.physicalName}.${columnShareModel.physicalName}`
                    + ` IS '${escapeComment(columnShareModel.logicalName)}'`;
            })
            .filter((comment): comment is string => (comment != null));

        if (tableModel.logicalName !== tableModel.physicalName) {
            commentQueries.unshift(`COMMENT ON TABLE ${tableModel.physicalName} IS '${escapeComment(tableModel.logicalName)}'`);
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