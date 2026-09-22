
import ErdDocument from "~/models/ErdDocument";

export type StartUpActions = {
    onOpenCreateDialog: () => void;
    onOpenImportDialog: () => void;
    onOpenSample: () => void;
};

/**
 * ドキュメントを開く際の契機を LocalApplication に伝える。以降の保存・複数タブ間同期は
 * documentKey と initialRevision をもとに LocalApplication 側が一括して構築する。
 */
export type OnOpenLocalDocument = (
    documentKey: string, openDocument: ErdDocument, initialRevision: number
) => void;
