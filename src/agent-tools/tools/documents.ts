import {
    ReadResourceCallback, ReadResourceTemplateCallback, ResourceTemplate, ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { pathToFileURL } from "url";
import z from "zod";

import { DocumentResource } from "~/agent-tools/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/agent-tools/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, findDocument, initResourceNotFound, initResourceResponse, initToolJsonResponse,
    McpRegisterConfig, McpServerRegisterResourceArgs, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/agent-tools/tools/support";
import { toTableSummary } from "~/agent-tools/tools/tables";
import { createDdl } from "~/models/create-ddl";
import { toNextOrthogonalLines } from "~/features/canvas/support";
import DisplayColumnStyle from "~/models/DisplayColumnStyle";
import DisplayNameStyle from "~/models/DisplayNameStyle";
import RectangleViewModel from "~/models/RectangleViewModel";
import { DragState } from "~/models/DragState";
import { SelectState } from "~/models/SelectState";

export const mcpRegisterErdDocument = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [
            resourceListDocuments(documentResource)
        ],
        resourceTemplates: [
            resourceFindDocumentById(documentResource)
        ],
        tools: [
            mcpListDocuments(documentResource),
            mcpFindDocument(documentResource),
            mcpFindDocumentByFilePath(documentResource),
            mcpUpdateDocument(documentResource),
            mcpMoveRectangle(documentResource),
            mcpExportDdl(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== list-documents ====================

const descriptionList = `\
Retrieves a list of currently accessible ERD documents.
To manipulate ERD documents, the corresponding document must be registered in the current session
(e.g., opened in an editor or specified via --file in the CLI).

RESPONSE:
An array of document summary objects, each containing:
- uri: The unique URI of the document (format: erd-designer://documents/{documentId}).
- documentId: The unique identifier of the document (16-character hex string derived from the document URI).
- filePath: The file path of the document in the file system.
- documentName: The name of the document.
- databaseName: The name of the database associated with the document.
- lastUpdatedAt: The date and time when the document was last updated (ISO 8601 format).
`;

const resourceListDocuments = (documentResource: DocumentResource): McpServerRegisterResourceArgs => {
    return [
        "list-documents",
        uriTemplates.documents,
        {
            title: "List ERD documents",
            description: descriptionList,
            mimeType: "application/json"
        },
        initResourceCallbackForListDocuments(documentResource)
    ] as const;
};

const initResourceCallbackForListDocuments = (
    documentResource: DocumentResource
): ReadResourceCallback => {
    return async (url) => {
        const responses = listDocumentSummaries(documentResource);
        return initResourceResponse(url, responses);
    };
};

const mcpListDocuments = (documentResource: DocumentResource): McpServerRegisterToolArgs<Record<string, never>> => {
    return [
        "list-documents",
        {
            title: "List ERD documents",
            description: descriptionList,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListDocuments(documentResource)
    ] as const;
};

const initCallbackForListDocuments = (
    documentResource: DocumentResource
): ToolCallback<Record<string, never>> => {
    return async () => {
        const responses = listDocumentSummaries(documentResource);
        return initToolJsonResponse(responses);
    };
};

const listDocumentSummaries = (documentResource: DocumentResource) => {
    const budgets = documentResource.fetchDocuments();
    return budgets.map(budget => toSummary(budget));
};

const toSummary = (budget: DocumentBudget) => {
    return {
        uri: budget.documentUri(),
        documentId: budget.documentId,
        filePath: budget.fileUri,
        documentName: budget.erdDocument.documentName,
        databaseName: budget.erdDocument.getDatabase().name,
        lastUpdatedAt: budget.erdDocument.lastUpdatedAt.toISOString()
    };
};

// ==================== find-document ====================

const descriptionFindById = `\
Retrieves detailed information about an ERD document using its documentId.
This tool returns URIs for accessing detailed information about the corresponding ERD document.
To retrieve tables, relations, and other information, call the respective tools using the IDs provided.

COORDINATE SYSTEM:
All position coordinates in this document use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right (positive values = right of center, negative values = left of center)
- Y-axis: increases downward (positive values = below center, negative values = above center)
When specifying or moving element positions, use this coordinate system as reference.

REQUEST:
- documentId: The unique identifier of the document to retrieve.
  Can be obtained by calling the 'list-documents' tool.

RESPONSE:
An object containing detailed document information:
- uri: The unique URI of the document (format: erd-designer://documents/{documentId}).
- documentId: The unique identifier of the document (16-character hex string derived from the document URI).
- filePath: The file path of the document in the file system.
- documentName: The name of the document.
- database: Information about the database, including:
  - uri: The URI to access database details.
  - databaseName: The name of the database.
- tables: An array of table objects, each containing:
  - uri: The URI to access detailed table information.
  - tableId: The unique identifier of the table.
  - tableName: Object with physical and logical names.
  - view: Display settings including position, size, and color.
- relations: An array of relation objects, each containing:
  - uri: The URI to access detailed relation information.
  - relationId: The unique identifier of the relation.
  - relationName: The name of the relation.
  - parentTableId: The id of the parent table.
  - childTableId: The id of the child table.
- memos: An array of memo objects, each containing:
  - uri: The URI to access detailed memo information.
  - memoId: The unique identifier of the memo.
  - view: Display settings including position, size, and color.
- setting: The document's display settings and URIs for further settings:
  - displayNameStyle: Whether tables show physical, logical, or both names ('physical', 'logical', 'both').
  - displayColumnStyle: Which columns the canvas shows ('all', 'pk', 'pk_fk', 'none').
    When it is not 'all', some columns exist in the document but are hidden on the canvas.
  - perspectives: URI to access perspective settings.
  - columnGroups: URI to access column group settings.
  - schemas: URI to access schema settings (only if database supports schemas).
- lastUpdatedAt: The date and time when the document was last updated (ISO 8601 format).
`;

const resourceFindDocumentById = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-document-by-id",
        new ResourceTemplate(uriTemplates.documentDetail, { list: undefined }),
        {
            title: "Find ERD document by documentId",
            description: descriptionFindById
        },
        initResourceCallbackForFindDocumentById(documentResource)
    ] as const;
};

const initResourceCallbackForFindDocumentById = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const { erdBudget } = findDocument(documentResource, documentId);

        const response = toDetail(erdBudget);
        return initResourceResponse(url, response);
    };
};

const findDocumentInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID)
};

const mcpFindDocument = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findDocumentInputSchema> => {
    return [
        "find-document",
        {
            title: "Find ERD document by documentId",
            description: descriptionFindById,
            inputSchema: findDocumentInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindDocument(documentResource)
    ] as const;
};

const initCallbackForFindDocument = (
    documentResource: DocumentResource
): ToolCallback<typeof findDocumentInputSchema> => {
    return async ({ documentId }) => {
        const { erdBudget } = findDocument(documentResource, documentId);

        const response = toDetail(erdBudget);
        return initToolJsonResponse(response);
    };
};

const toDetail = (erdBudget: DocumentBudget) => {
    const erdDocument = erdBudget.erdDocument;

    const tableViews = erdDocument.getTableViewModels()
        .map(tableView => toTableSummary(erdBudget, tableView));

    const relationModels = erdDocument.getRelationViewModels()
        .map(relationView => {
            return {
                uri: erdBudget.relationUri(relationView.relationId),
                relationId: relationView.relationId,
                relationName: relationView.relationModel.relationName,
                parentTableId: relationView.parentTableModelId,
                childTableId: relationView.childTableModelId
            };
        });

    const memoInfo = erdDocument.getMemoViewModels();
    const memos = [...memoInfo.frontMemos, ...memoInfo.backMemos]
        .map(memoView => {
            return {
                uri: erdBudget.memoUri(memoView.memoId),
                memoId: memoView.memoId,
                view: {
                    position: {
                        x: memoView.rectangleViewModel.left,
                        y: memoView.rectangleViewModel.top
                    },
                    size: {
                        width: memoView.rectangleViewModel.width,
                        height: memoView.rectangleViewModel.height
                    },
                    color: {
                        background: memoView.backgroundColor.toHex(),
                        foreground: memoView.foregroundColor.toHex()
                    }
                }
            };
        });

    const database = erdDocument.getDatabase();

    return {
        uri: erdBudget.documentUri(),
        documentId: erdBudget.documentId,
        filePath: erdBudget.fileUri,
        documentName: erdDocument.documentName,
        database: {
            uri: erdBudget.databaseUri(),
            databaseName: database.name,
        },
        tables: tableViews,
        relations: relationModels,
        memos: memos,
        setting: {
            displayNameStyle: toDisplayNameStyleKey(erdDocument.getDisplayNameStyle()),
            displayColumnStyle: erdDocument.getDisplayColumnStyle().key,
            perspectives: { uri: erdBudget.perspectiveListUri() },
            columnGroups: { uri: erdBudget.columnGroupListUri() },
            ...(database.supportsSchema && {
                schemas: { uri: erdBudget.schemaListUri() }
            })
        },

        lastUpdatedAt: erdDocument.lastUpdatedAt.toISOString()
    };
};

// update-document の displayNameStyle enum と同じ語彙でレスポンスを返し、読み取り値をそのまま再入力できるようにする
const toDisplayNameStyleKey = (displayNameStyle: DisplayNameStyle): string => {
    if (displayNameStyle.equals(DisplayNameStyle.PHYSICAL)) {
        return "physical";
    }
    if (displayNameStyle.equals(DisplayNameStyle.LOGICAL)) {
        return "logical";
    }
    return "both";
};

// ==================== find-document-by-filepath ====================

const descriptionFindByFilepath = `\
Retrieves detailed information about an ERD document by its file path.
Accepts both absolute OS paths and file URIs.
The document must be registered in the current session.

RESPONSE:
Same format as the 'find-document' tool response.
`;

const findDocumentByFilepathInputSchema = {
    filePath: z.string()
        .describe("The file path or URI of the ERD document. "
            + "Accepts both absolute OS paths (e.g., /path/to/document.erd) "
            + "and file URIs (e.g., file:///path/to/document.erd). "
            + "The document must be registered in the current session.")
};

const mcpFindDocumentByFilePath = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findDocumentByFilepathInputSchema> => {
    return [
        "find-document-by-filepath",
        {
            title: "Find ERD document by file path",
            description: descriptionFindByFilepath,
            inputSchema: findDocumentByFilepathInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindDocumentByFilepath(documentResource)
    ] as const;
};

const initCallbackForFindDocumentByFilepath = (
    documentResource: DocumentResource
): ToolCallback<typeof findDocumentByFilepathInputSchema> => {
    return async ({ filePath }) => {
        const fileUri = filePath.startsWith("file://") ? filePath : pathToFileURL(filePath).href;
        const budget = documentResource.findByUri(fileUri);
        if (budget == null) {
            const url = new URL(fileUri);
            throw initResourceNotFound(url);
        }

        const response = toDetail(budget);
        return initToolJsonResponse(response);
    };
};

// ==================== update-document ====================

const descriptionUpdate = `\
Updates the name or display settings of an existing ERD document.
You can update the document name, the name display style, the column display style,
or any combination of these properties simultaneously.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- document: An object containing the fields to be updated (all fields are optional):
  - documentName: The new name for the document. Leading and trailing whitespace will be trimmed.
  - displayNameStyle: The new name display style for the document. Must be one of:
    - 'physical': Display only physical names
    - 'logical': Display only logical names
    - 'both': Display both physical and logical names
  - displayColumnStyle: Which columns are shown on the canvas for every table. Must be one of:
    - 'all': Show all columns
    - 'pk': Show only primary key columns
    - 'pk_fk': Show primary key and foreign key columns
    - 'none': Show no columns (table name only)

  Note: If no fields are provided, the document remains unchanged.
  At least one field should be provided to make meaningful changes.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated document (format: erd-designer://documents/{documentId}).
- name: The updated document name.
`;

const mcpUpdateDocument = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateDocumentInputSchema> => {
    return [
        "update-document",
        {
            title: "Update the name or display settings of ERD document",
            description: descriptionUpdate,
            inputSchema: updateDocumentInputSchema
        },
        initCallbackForUpdatingDocument(documentResource)
    ] as const;
};

const updateDocumentInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    document: z.object({
        documentName: z.string().optional()
            .describe("The new name for the document."),
        displayNameStyle: z.enum(["both", "physical", "logical"]).optional()
            .describe("The new name display style for the document ('physical', 'logical', or 'both')."),
        displayColumnStyle: z.enum(["all", "pk", "pk_fk", "none"]).optional()
            .describe("Which columns the canvas shows for every table "
                + "('all', 'pk', 'pk_fk', or 'none').")
    }).describe("The document properties to update.")
};

const initCallbackForUpdatingDocument = (
    documentResource: DocumentResource
): ToolCallback<typeof updateDocumentInputSchema> => {
    return async ({ documentId, document: inputDocument }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);

        let nextDocument = previousDocument;
        if (inputDocument.documentName) {
            nextDocument = nextDocument.updateDocumentName(inputDocument.documentName.trim());
        }

        // 表示設定は 1 つの ErdSettingModel に同居するため、複数指定でも update は 1 回に集約する
        const displayNameStyle = (inputDocument.displayNameStyle != null)
            ? toDisplayNameStyle(inputDocument.displayNameStyle) : null;
        const displayColumnStyle = (inputDocument.displayColumnStyle != null)
            ? toDisplayColumnStyle(inputDocument.displayColumnStyle) : null;
        if ((displayNameStyle != null) || (displayColumnStyle != null)) {
            const nextSetting = previousDocument.erdSettingModel.update({ displayNameStyle, displayColumnStyle });
            nextDocument = nextDocument.updateErdSetting(nextSetting);
        }

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.documentUri(),
                    name: nextDocument.documentName,
                    mimeType: "application/json"
                }
            ]
        };
    }
};

const toDisplayNameStyle = (style: "both" | "physical" | "logical"): DisplayNameStyle => {
    switch (style) {
        case "both":
            return DisplayNameStyle.BOTH;
        case "physical":
            return DisplayNameStyle.PHYSICAL;
        case "logical":
            return DisplayNameStyle.LOGICAL;
    }
};

const toDisplayColumnStyle = (style: "all" | "pk" | "pk_fk" | "none"): DisplayColumnStyle => {
    switch (style) {
        case "all":
            return DisplayColumnStyle.ALL;
        case "pk":
            return DisplayColumnStyle.ONLY_PK;
        case "pk_fk":
            return DisplayColumnStyle.PK_OR_FK;
        case "none":
            return DisplayColumnStyle.NONE;
    }
};

// ==================== move-rectangle ====================

const descriptionMoveRectangle = `\
Moves tables and memos within an ERD document by applying RELATIVE offsets to their current positions.
This is a relative movement operation - the x and y values specify how far to move from each element's
current position, NOT absolute coordinates. This allows you to reposition multiple tables and memos
simultaneously while maintaining their relative positions to each other.

TOOL SELECTION GUIDE:
- Use move-rectangle when you need to move tables and memos TOGETHER at once (mixed relative movement).
- Use move-table when you need to move tables only, especially with absolute positioning support.
- Use move-memo when you need to move memos only, especially with absolute positioning support.

IMPORTANT: This tool performs RELATIVE MOVEMENT, not absolute positioning.
- To move elements 100 pixels to the right from their current positions: x = 100
- To move elements 50 pixels up from their current positions: y = -50
- The elements' final positions = current positions + movement offsets

COORDINATE SYSTEM:
All position coordinates in this document use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right (positive values = right of center, negative values = left of center)
- Y-axis: increases downward (positive values = below center, negative values = above center)

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableIds (optional): An array of table IDs to be moved.
  If omitted or empty, no tables will be moved.
- memoIds (optional): An array of memo IDs to be moved.
  If omitted or empty, no memos will be moved.
- moving: An object specifying the RELATIVE movement offsets (not absolute positions):
  - x: The offset distance to move along the X-axis (positive = right, negative = left).
  - y: The offset distance to move along the Y-axis (positive = down, negative = up).

  Examples of relative movement:
  - { x: 100, y: 0 }: Move 100 pixels to the right
  - { x: 0, y: -50 }: Move 50 pixels up
  - { x: -200, y: 100 }: Move 200 pixels left and 100 pixels down

  Note: At least one of tableIds or memoIds should be provided with non-empty values.
  All specified elements will move by the same offset, maintaining their relative positions to each other.

RESPONSE:
A text message and resource link containing:
- A summary of the movement operation (number of tables and memos moved).
- A resource link to the updated document.
`;

const mcpMoveRectangle = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof moveRectangleInputSchema> => {
    return [
        "move-rectangle",
        {
            title: "Move tables and memos by relative offset in ERD document",
            description: descriptionMoveRectangle,
            inputSchema: moveRectangleInputSchema
        },
        initCallbackForMoveRectangle(documentResource)
    ] as const;
};

const moveRectangleInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableIds: z.array(z.string()).optional().describe("The IDs of the tables to move."),
    memoIds: z.array(z.string()).optional().describe("The IDs of the memos to move."),
    moving: z.object({
        x: z.number().describe("The distance to move along the X-axis."),
        y: z.number().describe("The distance to move along the Y-axis.")
    }).describe("The distances to move along the X and Y axes.")
};

const initCallbackForMoveRectangle = (
    documentResource: DocumentResource
): ToolCallback<typeof moveRectangleInputSchema> => {
    return async ({ documentId, tableIds, memoIds, moving: movingArg }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);

        const relationViews = previousDocument.fetchRelationsByTableIds(tableIds || [])
            .filter(relation => relation.lineViewModel.lineType === "orthogonal");
        const tableRectangles = new Map(
            Array.from(erdBudget.getRectangles().entries()).map(entry => {
                const [key, rectangle] = entry;
                const rectangleView = new RectangleViewModel({ ...rectangle });
                return [key, rectangleView];
            })
        );

        const moving = { x: movingArg.x, y: movingArg.y };
        const tableIdSet = new Set(tableIds || []);
        const memoIdSet = new Set(memoIds || []);
        const selectState: SelectState = {
            status: "selected",
            tableIds: tableIdSet,
            memoIds: memoIdSet
        };
        // toNextOrthogonalLines の引数にわたす際に、relation が選択状態になっていないので、必要な情報は移動差分のみ
        const dragState: DragState = {
            status: "on_dragging",
            start: { x: 0, y: 0 },
            current: { x: moving.x, y: moving.y },
            delta: () => {
                return { x: moving.x, y: moving.y };
            }
        };

        const nextOrthogonal = toNextOrthogonalLines({
            relationViews, tableRectangles, selectState, dragState
        });

        const nextDocument = previousDocument
            .moveTableView(tableIdSet, moving, nextOrthogonal)
            .moveMemoView(memoIdSet, moving);

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "text",
                    text: `Moved ${tableIdSet.size} tables and ${memoIdSet.size} memos.`
                },
                {
                    type: "resource_link",
                    uri: erdBudget.documentUri(),
                    name: nextDocument.documentName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

// ==================== export-ddl ====================

const descriptionExportDdl = `\
Generates DDL (Data Definition Language) statements based on the ERD document's table definitions.
The generated DDL includes CREATE TABLE, CREATE INDEX, FOREIGN KEY constraints, and COMMENT statements
according to the specified export settings.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- exportDdlSetting: An object containing DDL export options (all fields are optional):
  - fileName: The output file name (informational only, does not create a file).
  - withTable: Whether to include CREATE TABLE statements (default: true).
  - withIndex: Whether to include CREATE INDEX statements (default: true).
  - withForeignKey: Whether to include FOREIGN KEY constraints (default: true).
  - withComment: Whether to include COMMENT statements (default: true).
  - withSchema: Whether to include CREATE SCHEMA statements (default: true).
  - commentStyle: The comment style for DDL export (default: 'logical_name').
    - 'logical_name': Output only the logical name as a comment.
    - 'with_description': Output the logical name and description separated by commentSeparator.
  - commentSeparator: The separator string between the logical name and description when commentStyle is 'with_description' (default: ' : ').

RESPONSE:
A text content containing the generated DDL statements.
`;

const mcpExportDdl = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof exportDdlInputSchema> => {
    return [
        "export-ddl",
        {
            title: "Generate DDL from ERD document",
            description: descriptionExportDdl,
            inputSchema: exportDdlInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForExportDdl(documentResource)
    ] as const;
};

const exportDdlInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    exportDdlSetting: z.object({
        fileName: z.string().optional()
            .describe("The output file name (informational only)."),
        withTable: z.boolean().optional()
            .describe("Whether to include CREATE TABLE statements (default: true)."),
        withIndex: z.boolean().optional()
            .describe("Whether to include CREATE INDEX statements (default: true)."),
        withForeignKey: z.boolean().optional()
            .describe("Whether to include FOREIGN KEY constraints (default: true)."),
        withComment: z.boolean().optional()
            .describe("Whether to include COMMENT statements (default: true)."),
        withSchema: z.boolean().optional()
            .describe("Whether to include CREATE SCHEMA statements (default: true)."),
        commentStyle: z.enum(["logical_name", "with_description"]).optional()
            .describe("The comment style for DDL export. 'logical_name' outputs only the logical name, " +
                "'with_description' appends the description with a separator (default: 'logical_name')."),
        commentSeparator: z.string().optional()
            .describe("The separator string between the logical name and description " +
                "when commentStyle is 'with_description' (default: ' : ').")
    }).optional().describe("The DDL export settings.")
};

const initCallbackForExportDdl = (
    documentResource: DocumentResource
): ToolCallback<typeof exportDdlInputSchema> => {
    return async ({ documentId, exportDdlSetting }) => {
        const { erdDocument } = findDocument(documentResource, documentId);
        const exportSetting = erdDocument.erdSettingModel.exportDdlSetting;

        const ddl = createDdl(erdDocument, {
            withTable: exportDdlSetting?.withTable ?? exportSetting.withTable,
            withIndex: exportDdlSetting?.withIndex ?? exportSetting.withIndex,
            withForeignKey: exportDdlSetting?.withForeignKey ?? exportSetting.withForeignKey,
            withSchema: exportDdlSetting?.withSchema ?? exportSetting.withSchema,
            withComment: exportDdlSetting?.withComment ?? exportSetting.withComment,
            commentStyle: exportDdlSetting?.commentStyle ?? exportSetting.commentStyle,
            commentSeparator: exportDdlSetting?.commentSeparator ?? exportSetting.commentSeparator
        });

        return {
            content: [
                {
                    type: "text",
                    text: ddl
                }
            ]
        };
    };
};
