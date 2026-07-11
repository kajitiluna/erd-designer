import { DocumentResource } from "~/agent-tools/DocumentResource";
import { mcpRegisterColumnGroup } from "~/agent-tools/tools/column-groups";
import { mcpRegisterColumnType } from "~/agent-tools/tools/column-types";
import { mcpRegisterColumn } from "~/agent-tools/tools/columns";
import { mcpRegisterDatabase } from "~/agent-tools/tools/database";
import { mcpRegisterErdDocument } from "~/agent-tools/tools/documents";
import { mcpRegisterMemo } from "~/agent-tools/tools/memos";
import { mcpRegisterPerspective } from "~/agent-tools/tools/perspectives";
import { mcpRegisterRelation } from "~/agent-tools/tools/relations";
import { mcpRegisterSchema } from "~/agent-tools/tools/schemas";
import { mcpRegisterColumnStruct } from "~/agent-tools/tools/struct-types";
import { McpRegisterConfig } from "~/agent-tools/tools/support";
import { mcpRegisterTable } from "~/agent-tools/tools/tables";

/**
 * agent-tools 層が提供する全ツールモジュールのカタログ。
 * ホスト(MCP サーバ、CLI)はこの一覧を唯一の情報源として利用し、個別に列挙しない。
 */
export const initToolRegistrations = (documentResource: DocumentResource): McpRegisterConfig[] => {
    return [
        // `erd-designer://documents`
        mcpRegisterErdDocument(documentResource),
        // `erd-designer://documents/{documentId}/database`
        mcpRegisterDatabase(documentResource),
        // `erd-designer://documents/{documentId}/tables`
        mcpRegisterTable(documentResource),
        // `erd-designer://documents/{documentId}/columns`
        // `erd-designer://documents/{documentId}/column_shares/`
        mcpRegisterColumn(documentResource),
        // `erd-designer://documents/{documentId}/column_types`
        mcpRegisterColumnType(documentResource),
        // `erd-designer://documents/{documentId}/relations`
        mcpRegisterRelation(documentResource),
        // `erd-designer://documents/{documentId}/schemas`
        mcpRegisterSchema(documentResource),
        // `erd-designer://documents/{documentId}/column_groups`
        mcpRegisterColumnGroup(documentResource),
        // `erd-designer://documents/{documentId}/column_structs`
        mcpRegisterColumnStruct(documentResource),
        // `erd-designer://documents/{documentId}/memos`
        mcpRegisterMemo(documentResource),
        // `erd-designer://documents/{documentId}/perspectives`
        mcpRegisterPerspective(documentResource)
    ];
};
