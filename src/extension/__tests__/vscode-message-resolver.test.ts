import { describe, test, expect, afterEach } from "vitest";

import { onExternalChangedDocument } from "~/extension/vscode-message-resolver";
import ExternalDocumentChangeDispatcher from "~/components/ExternalDocumentChangeDispatcher";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create("mysql")
    });
};

const buildChangeDocumentMessage = (erdDocument: ErdDocument, alreadyPersisted: boolean) => {
    return {
        eventSource: "erd-designer" as const,
        messageType: "changeDocument" as const,
        documentUri: "file:///test/document.erd",
        jsonContext: JSON.stringify(erdDocument.toJSON()),
        alreadyPersisted
    };
};

describe("onExternalChangedDocument", () => {
    afterEach(() => {
        const dummyListener = () => { };
        window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, dummyListener);
    });

    test("alreadyPersisted: true の場合、changeDispatcher 経由で dispatch し isEcho が効くようにする", () => {
        const changeDispatcher = new ExternalDocumentChangeDispatcher();
        const erdDocument = createTestDocument("already-on-disk");

        // onExternalChangedDocument は jsonContext から再構築するため、
        // 送信元の erdDocument とは別インスタンスになる。isEcho は受信側のインスタンスで判定する。
        let receivedDocument: ErdDocument | null = null;
        let isEchoDuringDispatch = false;
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            receivedDocument = customEvent.detail.erdDocument;
            isEchoDuringDispatch = changeDispatcher.isEcho(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            const message = buildChangeDocumentMessage(erdDocument, true);
            const result = onExternalChangedDocument(message, changeDispatcher);
            expect(result).toEqual({ succeeded: true });
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
        }

        // dispatch 区間の外では isEcho は false に戻る
        expect(isEchoDuringDispatch).toBe(true);
        expect(receivedDocument).not.toBeNull();
        expect(changeDispatcher.isEcho(receivedDocument as unknown as ErdDocument)).toBe(false);
    });

    test("alreadyPersisted: false (MCP 由来など) の場合、changeDispatcher の echo 抑止が効いてはならない", () => {
        const changeDispatcher = new ExternalDocumentChangeDispatcher();
        const erdDocument = createTestDocument("mcp-pending-save");

        const received: ErdDocument[] = [];
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            received.push(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            const message = buildChangeDocumentMessage(erdDocument, false);
            const result = onExternalChangedDocument(message, changeDispatcher);
            expect(result).toEqual({ succeeded: true });
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
        }

        expect(received).toHaveLength(1);
        // MCP 由来の変更はまだファイルへ書き込まれていないため、
        // handleSaveDocument の isEcho チェックに引っかかって保存が止まってはいけない
        expect(changeDispatcher.isEcho(received[0])).toBe(false);
    });

    test("不正な JSON の場合は succeeded: false を返す", () => {
        const changeDispatcher = new ExternalDocumentChangeDispatcher();
        const invalidMessage = {
            eventSource: "erd-designer" as const,
            messageType: "changeDocument" as const,
            documentUri: "file:///test/document.erd",
            jsonContext: "not a json",
            alreadyPersisted: true
        };

        const result = onExternalChangedDocument(invalidMessage, changeDispatcher);
        expect(result.succeeded).toBe(false);
    });
});
