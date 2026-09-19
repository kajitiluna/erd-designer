import ErdDocument from "~/models/ErdDocument";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";

/**
 * 外部 (別ウィンドウ、Google Drive のリモート更新、VSCode 拡張機能側) から取り込んだ ErdDocument を
 * MainView へ伝える。ドキュメントの履歴管理は MainView 側の documentsHolder が一元的に担うため、
 * 取り込んだ内容は常にこのクラス経由で EXTERNAL_DOCUMENT_CHANGED_EVENT へ委譲する。
 *
 * MainView が変更を取り込むと、保存トリガーである onSave がその内容でそのまま呼び出される
 * (documentsHolder はどこから来た更新かを区別しない)。isEcho はこの折り返しを検知するためにある。
 * dispatch 中だけ取り込んだインスタンスを保持し、onSave に渡された引数がそれと同一参照であれば
 * 自分自身が発生させた保存だと判定できる。
 */
export class ExternalDocumentChangeDispatcher {

    private dispatchingDocument: ErdDocument | null;

    constructor() {
        this.dispatchingDocument = null;
    }

    /**
     * onSave に渡されたドキュメントが、直前に自分が取り込んだ変更の折り返しかどうかを判定する。
     *
     * @param erdDocument onSave に渡されたドキュメント
     */
    public isEcho(erdDocument: ErdDocument): boolean {
        return erdDocument === this.dispatchingDocument;
    }

    /**
     * 外部から取り込んだ変更を MainView に伝える。
     *
     * @param erdDocument 取り込んだ変更後のドキュメント
     */
    public dispatch(erdDocument: ErdDocument): void {
        this.dispatchingDocument = erdDocument;

        try {
            const customEvent = new CustomEvent(EXTERNAL_DOCUMENT_CHANGED_EVENT, { detail: { erdDocument } });
            window.dispatchEvent(customEvent);
        } finally {
            this.dispatchingDocument = null;
        }
    }
}
