import { describe, test, expect, afterEach } from "vitest";

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

describe("ExternalDocumentChangeDispatcher", () => {
    afterEach(() => {
        // 各テストで張ったリスナーが後続テストへ影響しないようにする
        const dummyListener = () => { };
        window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, dummyListener);
    });

    test("dispatch すると EXTERNAL_DOCUMENT_CHANGED_EVENT が該当ドキュメントを載せて発火する", () => {
        const dispatcher = new ExternalDocumentChangeDispatcher();
        const erdDocument = createTestDocument("dispatched");

        const received: ErdDocument[] = [];
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            received.push(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            dispatcher.dispatch(erdDocument);
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
        }

        expect(received).toEqual([erdDocument]);
    });

    test("dispatch 中に渡されたのと同一インスタンスは isEcho が true を返す", () => {
        const dispatcher = new ExternalDocumentChangeDispatcher();
        const erdDocument = createTestDocument("dispatched");

        let isEchoDuringDispatch = false;
        const handleEvent = () => {
            isEchoDuringDispatch = dispatcher.isEcho(erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            dispatcher.dispatch(erdDocument);
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
        }

        expect(isEchoDuringDispatch).toBe(true);
    });

    test("dispatch が完了した後は isEcho が false に戻る", () => {
        const dispatcher = new ExternalDocumentChangeDispatcher();
        const erdDocument = createTestDocument("dispatched");

        dispatcher.dispatch(erdDocument);

        expect(dispatcher.isEcho(erdDocument)).toBe(false);
    });

    test("dispatch していないドキュメントは isEcho が false", () => {
        const dispatcher = new ExternalDocumentChangeDispatcher();
        const dispatchedDocument = createTestDocument("dispatched");
        const otherDocument = createTestDocument("other");

        dispatcher.dispatch(dispatchedDocument);

        expect(dispatcher.isEcho(otherDocument)).toBe(false);
    });
});
