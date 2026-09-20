import React from "react";

import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import { localDocumentSyncChannelFactory } from "~/features/storage/LocalDocumentSyncChannel";
import ErdDocument from "~/models/ErdDocument";

type UseLocalDocumentSyncArgs = {
    documentStorage: ErdDocumentStorage,
    documentKey: string,
    erdDocument: ErdDocument,
    initialRevision: number
};

export type LocalDocumentSync = {
    /** MainView へ渡す保存ハンドラ */
    onSave: (updating: ErdDocument, loggingMessage: string) => void,
    /** 先勝ちの競合で保存が拒否された状態 */
    conflictDetected: boolean,
    dismissConflict: () => void
};

/**
 * 1 ドキュメントぶんの複数ウィンドウ同期をまとめて受け持つ。
 * チャネルの購読はこのフックの effect が setup / cleanup 対で管理するため、
 * StrictMode やホットリロードによる再マウントでも購読が張り直される。
 */
const useLocalDocumentSync = ({
    documentStorage, documentKey, erdDocument, initialRevision
}: UseLocalDocumentSyncArgs): LocalDocumentSync => {
    // 生成は副作用を持たないため、StrictMode が初期化子を複数回呼んでも余分な実体は
    // ただのオブジェクトとして捨てられる。React が採用した 1 つだけが購読を持つ。
    const [channel] = React.useState(() => {
        return localDocumentSyncChannelFactory.create(documentStorage, documentKey, erdDocument, initialRevision);
    });
    const [conflictDetected, setConflictDetected] = React.useState(false);

    // 購読の開始と解除を同一 effect の setup / cleanup 対で行う。
    // cleanup だけを持つ effect にすると、StrictMode の setup → cleanup → setup で
    // 閉じたまま復活せず、他ウィンドウとの同期が一切効かなくなる。
    React.useEffect(() => {
        return channel.subscribe();
    }, [channel]);

    const onSave = React.useCallback((updating: ErdDocument, loggingMessage: string) => {
        channel.publish(updating, loggingMessage).then(result => {
            if (result.result === "conflict") {
                setConflictDetected(true);
            }
        }).catch(error => {
            console.warn(`Failed to save document. key: ${documentKey}, detail: ${error}`);
        });
    }, [channel, documentKey]);

    const dismissConflict = React.useCallback(() => setConflictDetected(false), []);

    return { onSave, conflictDetected, dismissConflict };
};

export default useLocalDocumentSync;
