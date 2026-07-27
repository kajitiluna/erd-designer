import React from "react";

import download from "~/components/file-downloader";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import ErdDocument from "~/models/ErdDocument";
import MainView from "~/features/MainView";
import exportExcelFormatSpecification from "~/features/spec/ExcelFormatSpecification";

type ErdApplicationShellProps = {
    erdDocument: ErdDocument,
    onSave: (updating: ErdDocument, loggingMessage: string) => void,
    /** 仕様書エクスポート処理。省略時は Excel ファイルのダウンロードを行う */
    exportSpecification?: (erdDocument: ErdDocument, contents: ImageContent) => void,
    erdExportable?: boolean,
    remoteSyncable?: boolean,
    children?: React.ReactNode
};

/**
 * アプリケーションシェル (Local / GoogleDrive / VSCode 拡張) 共通のメインビュー構成。
 * 保存処理と仕様書エクスポート処理を各シェルから注入する。
 */
const ErdApplicationShell = ({
    erdDocument, onSave,
    exportSpecification = exportExcelSpecificationToFile,
    erdExportable = true,
    remoteSyncable = false,
    children
}: ErdApplicationShellProps) => {
    const exportContextValue = React.useMemo(() => {
        return { exportSpecification };
    }, [exportSpecification]);

    return (
        <ExportSpecificationContext.Provider value={exportContextValue}>
            <MainView erdDocument={erdDocument} onSave={onSave} erdExportable={erdExportable}
                remoteSyncable={remoteSyncable} />
            {children}
        </ExportSpecificationContext.Provider>
    );
};

const exportExcelSpecificationToFile = (erdDocument: ErdDocument, contents: ImageContent) => {
    exportExcelFormatSpecification(erdDocument, contents).then((specs: Blob) => {
        const fileName = `${erdDocument.documentName}.xlsx`;
        download(fileName, specs);
    });
};

export default ErdApplicationShell;
