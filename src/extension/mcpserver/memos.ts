import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    colorValueSchema, DESCRIPTION_DOCUMENT_ID, initResourceNotFound, initResourceResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import ColorValue from "~/models/ColorValue";
import MemoViewModel from "~/models/MemoViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";

export const mcpRegisterMemo = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListMemos(documentResource),
            mcpFindMemo(documentResource)
        ],
        tools: [
            mcpAddMemo(documentResource),
            mcpUpdateMemo(documentResource),
            mcpDeleteMemo(documentResource),
            mcpMoveMemo(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of all memos from the specified ERD document.
Memos are text annotations placed on the ERD canvas.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose memos are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

RESPONSE:
An array of memo objects, each containing:
- uri: The unique URI of the memo (format: erd-designer://documents/{documentId}/memos/{memoId}).
- memoId: The unique identifier of the memo (auto-generated UUID).
- memo: The text content of the memo.
- view: Display settings object containing:
  - position: Object with x and y coordinates of the memo on the ERD canvas.
  - size: Object with width and height of the memo.
  - color: Object with background and foreground colors in hex format.
  - font: Font display settings object containing:
    - verticalAlign: Vertical alignment ("start", "center", "end").
    - horizontalAlign: Horizontal alignment ("start", "center", "end").
    - fontSize: The font size.
`;

const mcpListMemos = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-memos",
        new ResourceTemplate(uriTemplates.memos, { list: undefined }),
        {
            title: "List memos of a specified ERD document",
            description: descriptionList
        },
        initCallbackForListMemos(documentResource)
    ] as const;
};

const initCallbackForListMemos = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const memoInfo = erdDocument.getMemoViewModels();
        const allMemos = [...memoInfo.frontMemos, ...memoInfo.backMemos];
        const responses = allMemos.map(memoView => toMemoDetail(erdBudget, memoView));

        return initResourceResponse(url, responses);
    };
};

const descriptionFind = `\
Retrieves detailed information about a specific memo from the specified ERD document using its memoId.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- memoId: The unique identifier of the memo to retrieve.
  Can be obtained from the memos list resource or from the document's memos array.

RESPONSE:
An object containing detailed information about the specified memo:
- uri: The unique URI of the memo (format: erd-designer://documents/{documentId}/memos/{memoId}).
- memoId: The unique identifier of the memo (auto-generated UUID).
- memo: The text content of the memo.
- view: Display settings object containing:
  - position: Object with x and y coordinates of the memo on the ERD canvas.
  - size: Object with width and height of the memo.
  - color: Object with background and foreground colors in hex format.
  - font: Font display settings object containing:
    - verticalAlign: Vertical alignment ("start", "center", "end").
    - horizontalAlign: Horizontal alignment ("start", "center", "end").
    - fontSize: The font size.
`;

const mcpFindMemo = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-memo",
        new ResourceTemplate(uriTemplates.memoDetail, { list: undefined }),
        {
            title: "Find a memo of a specified ERD document",
            description: descriptionFind
        },
        initCallbackForFindMemo(documentResource)
    ] as const;
};

const initCallbackForFindMemo = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const memoId = variables.memoId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const memoView = erdDocument.findMemoViewModel(memoId);
        if (memoView == null) {
            throw initResourceNotFound(url);
        }

        const response = toMemoDetail(erdBudget, memoView);

        return initResourceResponse(url, response);
    };
};

const toMemoDetail = (erdBudget: DocumentBudget, memoView: MemoViewModel) => {
    return {
        uri: erdBudget.memoUri(memoView.memoId),
        memoId: memoView.memoId,
        memo: memoView.memo,
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
            },
            font: {
                verticalAlign: memoView.verticalAlign,
                horizontalAlign: memoView.horizontalAlign,
                fontSize: memoView.fontSize
            }
        }
    };
};

const alignTypeSchema = z.enum(["start", "center", "end"]);

const DEFAULT_MEMO_WIDTH = 200;
const DEFAULT_MEMO_HEIGHT = 150;
const DEFAULT_BACKGROUND_COLOR = "#FFFFE0";
const DEFAULT_FOREGROUND_COLOR = "#000000";

const descriptionAddMemo = `\
Add a new memo in a specified ERD document.
Memos are text annotations placed on the ERD canvas.

COORDINATE SYSTEM:
All position coordinates use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right
- Y-axis: increases downward

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- memo: An object adding the memo information:
  - memo: The text content of the memo (required).
  - position: Object with x and y coordinates for the memo position (required).
  - size: Object with width and height (optional, defaults to ${DEFAULT_MEMO_WIDTH}x${DEFAULT_MEMO_HEIGHT}).
  - color: Object with background and foreground colors in hex format (optional).
  - font: Font settings object (optional):
    - verticalAlign: Vertical alignment ("start", "center", "end").
    - horizontalAlign: Horizontal alignment ("start", "center", "end").
    - fontSize: The font size (must be >= 1).

RESPONSE:
The added memo object (same format as memo detail resource).
`;

const mcpAddMemo = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof addMemoInputSchema> => {
    return [
        "add-memo",
        {
            title: "Add a memo in a specified ERD document",
            description: descriptionAddMemo,
            inputSchema: addMemoInputSchema
        },
        initCallbackForAddMemo(documentResource)
    ] as const;
};

const addMemoInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    memo: z.object({
        memo: z.string().describe("The text content of the memo."),
        position: z.object({
            x: z.number().describe("The x-coordinate of the memo position."),
            y: z.number().describe("The y-coordinate of the memo position.")
        }).strict().describe("The position of the memo on the canvas."),
        size: z.object({
            width: z.number().min(1).describe("The width of the memo."),
            height: z.number().min(1).describe("The height of the memo.")
        }).strict().optional().describe("The size of the memo (optional)."),
        color: z.object({
            background: colorValueSchema.describe("The background color in hex format (e.g., #FFFFE0)."),
            foreground: colorValueSchema.describe("The foreground color in hex format (e.g., #000000).")
        }).strict().optional().describe("The color settings (optional)."),
        font: z.object({
            verticalAlign: alignTypeSchema.optional().describe("Vertical alignment."),
            horizontalAlign: alignTypeSchema.optional().describe("Horizontal alignment."),
            fontSize: z.number().min(1).optional().describe("The font size (must be >= 1).")
        }).strict().optional().describe("Font display settings (optional).")
    }).strict().describe("The memo information.")
};

const initCallbackForAddMemo = (documentResource: DocumentResource): ToolCallback<typeof addMemoInputSchema> => {
    return async ({ documentId, memo: memoInput }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;

        const width = memoInput.size?.width ?? DEFAULT_MEMO_WIDTH;
        const height = memoInput.size?.height ?? DEFAULT_MEMO_HEIGHT;
        const rectangleViewModel = new RectangleViewModel({
            positionX: memoInput.position.x,
            positionY: memoInput.position.y,
            width,
            height
        });

        const background = ColorValue.fromHex(memoInput.color?.background ?? DEFAULT_BACKGROUND_COLOR);
        const foreground = ColorValue.fromHex(memoInput.color?.foreground ?? DEFAULT_FOREGROUND_COLOR);
        const fontSize = memoInput.font?.fontSize;

        let newMemo = MemoViewModel.create(rectangleViewModel, { background, foreground }, fontSize);
        newMemo = newMemo.updateMemo(memoInput.memo);

        if (memoInput.font?.verticalAlign) {
            newMemo = newMemo.updateVerticalAlign(memoInput.font.verticalAlign);
        }
        if (memoInput.font?.horizontalAlign) {
            newMemo = newMemo.updateHorizontalAlign(memoInput.font.horizontalAlign);
        }

        const nextDocument = previousDocument.addMemo(newMemo);
        documentResource.notify(documentId, nextDocument);

        const response = toMemoDetail(erdBudget, newMemo);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response)
                }
            ]
        };
    };
};

const descriptionUpdateMemo = `\
Updates an existing memo in a specified ERD document.
Only the specified fields will be updated; unspecified fields remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- memoId: The unique identifier of the memo to update.
  Can be obtained from the memos list resource.
- memo: An object containing the fields to update (all optional):
  - memo: The new text content of the memo.
  - size: Object with width and height.
  - color: Object with background and foreground colors in hex format.
  - font: Font settings object:
    - verticalAlign: Vertical alignment ("start", "center", "end").
    - horizontalAlign: Horizontal alignment ("start", "center", "end").
    - fontSize: The font size (must be >= 1).

RESPONSE:
The updated memo object (same format as memo detail resource).
`;

const mcpUpdateMemo = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateMemoInputSchema> => {
    return [
        "update-memo",
        {
            title: "Update a memo in a specified ERD document",
            description: descriptionUpdateMemo,
            inputSchema: updateMemoInputSchema
        },
        initCallbackForUpdateMemo(documentResource)
    ] as const;
};

const updateMemoInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    memoId: z.string().describe("The unique identifier of the memo to update."),
    memo: z.object({
        memo: z.string().optional().describe("The new text content of the memo."),
        size: z.object({
            width: z.number().min(1).describe("The width of the memo."),
            height: z.number().min(1).describe("The height of the memo.")
        }).strict().optional().describe("The new size of the memo."),
        color: z.object({
            background: colorValueSchema.describe("The background color in hex format (e.g., #FFFFE0)."),
            foreground: colorValueSchema.describe("The foreground color in hex format (e.g., #000000).")
        }).strict().optional().describe("The new color settings."),
        font: z.object({
            verticalAlign: alignTypeSchema.optional().describe("Vertical alignment."),
            horizontalAlign: alignTypeSchema.optional().describe("Horizontal alignment."),
            fontSize: z.number().min(1).optional().describe("The font size (must be >= 1).")
        }).strict().optional().describe("Font display settings.")
    }).strict().describe("The memo fields to update.")
};

const initCallbackForUpdateMemo = (documentResource: DocumentResource): ToolCallback<typeof updateMemoInputSchema> => {
    return async ({ documentId, memoId, memo: memoInput }) => {
        const { erdBudget, erdDocument: previousDocument, memoView: previousMemo } =
            doFindDocumentAndMemo(documentResource, documentId, memoId);

        let nextMemo = previousMemo;

        if (memoInput.memo !== undefined) {
            nextMemo = nextMemo.updateMemo(memoInput.memo);
        }

        if (memoInput.size) {
            const nextRectangle = new RectangleViewModel({
                positionX: nextMemo.rectangleViewModel.positionX,
                positionY: nextMemo.rectangleViewModel.positionY,
                width: memoInput.size.width,
                height: memoInput.size.height
            });

            nextMemo = nextMemo.updateRectangle(nextRectangle);
        }

        if (memoInput.color) {
            const background = ColorValue.fromHex(memoInput.color.background);
            const foreground = ColorValue.fromHex(memoInput.color.foreground);

            nextMemo = nextMemo.updateColor(background, foreground);
        }

        if (memoInput.font) {
            if (memoInput.font.verticalAlign) {
                nextMemo = nextMemo.updateVerticalAlign(memoInput.font.verticalAlign);
            }
            if (memoInput.font.horizontalAlign) {
                nextMemo = nextMemo.updateHorizontalAlign(memoInput.font.horizontalAlign);
            }
            if (memoInput.font.fontSize !== undefined) {
                nextMemo = nextMemo.updateFontSize(memoInput.font.fontSize);
            }
        }

        const nextDocument = previousDocument.updateMemo(nextMemo);
        documentResource.notify(documentId, nextDocument);

        const response = toMemoDetail(erdBudget, nextMemo);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response)
                }
            ]
        };
    };
};

const descriptionDeleteMemo = `\
Deletes an existing memo from a specified ERD document.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- memoId: The unique identifier of the memo to delete.
  Can be obtained from the memos list resource.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteMemo = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteMemoInputSchema> => {
    return [
        "delete-memo",
        {
            title: "Delete a memo from a specified ERD document",
            description: descriptionDeleteMemo,
            inputSchema: deleteMemoInputSchema
        },
        initCallbackForDeleteMemo(documentResource)
    ] as const;
};

const deleteMemoInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    memoId: z.string().describe("The unique identifier of the memo to delete.")
};

const initCallbackForDeleteMemo = (documentResource: DocumentResource): ToolCallback<typeof deleteMemoInputSchema> => {
    return async ({ documentId, memoId }) => {
        const { erdDocument: previousDocument } =
            doFindDocumentAndMemo(documentResource, documentId, memoId);

        const nextDocument = previousDocument.deleteMemo(memoId);
        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true })
                }
            ]
        };
    };
};

const descriptionMoveMemo = `\
Moves one or more memos within an ERD document to either an absolute position or by a relative offset.
When moving to an absolute position, all specified memos are moved to the same coordinates.
When moving by a relative offset, each memo is moved from its current position by the specified amount.

COORDINATE SYSTEM:
All position coordinates use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right
- Y-axis: increases downward

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- memoIds: An array of memo IDs to be moved.
  Can be obtained from the memos list resource.
- moveTo: An object specifying the movement:
  - type: Either "absolute" (move to exact coordinates) or "relative" (move by offset from current position).
  - x: The x-coordinate (absolute) or x-offset (relative).
  - y: The y-coordinate (absolute) or y-offset (relative).

RESPONSE:
An array of updated memo objects (same format as memo detail resource).
`;

const mcpMoveMemo = (documentResource: DocumentResource): McpServerRegisterToolArgs<typeof moveMemoInputSchema> => {
    return [
        "move-memo",
        {
            title: "Move memos in a specified ERD document",
            description: descriptionMoveMemo,
            inputSchema: moveMemoInputSchema
        },
        initCallbackForMoveMemo(documentResource)
    ] as const;
};

const moveMemoInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    memoIds: z.array(z.string()).describe("The IDs of the memos to move."),
    moveTo: z.object({
        type: z.enum(["absolute", "relative"]).describe("The type of movement: 'absolute' or 'relative'."),
        x: z.number().describe("The x-coordinate (absolute) or x-offset (relative)."),
        y: z.number().describe("The y-coordinate (absolute) or y-offset (relative).")
    }).strict().describe("The movement specification.")
};

const initCallbackForMoveMemo = (documentResource: DocumentResource): ToolCallback<typeof moveMemoInputSchema> => {
    return async ({ documentId, memoIds, moveTo }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const nextDocument = (moveTo.type === "absolute")
            ? doMoveMemoAbsolute(erdBudget, memoIds, { x: moveTo.x, y: moveTo.y })
            : erdBudget.erdDocument.moveMemoView(new Set(memoIds), { x: moveTo.x, y: moveTo.y });

        documentResource.notify(documentId, nextDocument);

        const responses = memoIds.flatMap(memoId => {
            const memoView = nextDocument.findMemoViewModel(memoId);
            if (memoView == null) {
                return [];
            }

            return [toMemoDetail(erdBudget, memoView)];
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(responses)
                }
            ]
        };
    };
};

const doMoveMemoAbsolute = (erdBudget: DocumentBudget, memoIds: string[], moveTo: { x: number; y: number }) => {
    let nextDocument = erdBudget.erdDocument;
    for (const memoId of memoIds) {
        const memoView = nextDocument.findMemoViewModel(memoId);
        if (memoView == null) {
            const url = new URL(erdBudget.memoUri(memoId));
            throw initResourceNotFound(url);
        }

        const nextRectangle = new RectangleViewModel({
            positionX: moveTo.x,
            positionY: moveTo.y,
            width: memoView.rectangleViewModel.width,
            height: memoView.rectangleViewModel.height
        });

        const nextMemo = memoView.updateRectangle(nextRectangle);
        nextDocument = nextDocument.updateMemo(nextMemo);
    }

    return nextDocument;
};

const doFindDocumentAndMemo = (documentResource: DocumentResource, documentId: string, memoId: string) => {
    const erdBudget = documentResource.findById(documentId);
    if (erdBudget == null) {
        const url = new URL(uriTemplates.documentFor(documentId));
        throw initResourceNotFound(url);
    }

    const erdDocument = erdBudget.erdDocument;
    const memoView = erdDocument.findMemoViewModel(memoId);
    if (memoView == null) {
        const url = new URL(erdBudget.memoUri(memoId));
        throw initResourceNotFound(url);
    }

    return { erdBudget, erdDocument, memoView };
};