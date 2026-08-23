import * as path from 'path';
import * as vscode from 'vscode';

import { convertErm, ErmLoadSummary } from '~/models/erm';

// package.json の contributes.customEditors で宣言した viewType と一致させる
export const ERM_IMPORTER_VIEW_TYPE = 'erdDesigner.ermImporter';
const ERD_EDITOR_VIEW_TYPE = 'erdDesigner.erdEditor';

/**
 * .erm (ERMaster) ファイルを開いた際に .erd へ変換して保存し、
 * 通常の ERD Designer エディタで開き直すための CustomTextEditorProvider。
 * それ自体は編集可能な画面を持たず、変換結果を案内するだけの使い捨てタブとして機能する。
 */
export class ErmImportProvider implements vscode.CustomTextEditorProvider {

    resolveCustomTextEditor(
        textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): Thenable<void> | void {
        return handleImportingErmDocument(textDocument, webviewPanel);
    }
}

const handleImportingErmDocument = async (
    textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel
): Promise<void> => {
    webviewPanel.webview.options = { enableScripts: false };
    webviewPanel.webview.html = initReportHtml('Converting .erm file…', []);

    const documentName = path.basename(textDocument.uri.fsPath).replace(/\.erm$/i, '');
    const result = convertErm(documentName, textDocument.getText());

    if (result.result === "failure") {
        const message = `Failed to import "${path.basename(textDocument.uri.fsPath)}": ${result.failureMessage}`;
        vscode.window.showErrorMessage(message);
        webviewPanel.webview.html = initReportHtml(message, result.summaries);

        return;
    }

    const erdUri = toErdUri(textDocument.uri, documentName);

    try {
        const canProceed = await confirmOverwriteIfExists(erdUri);
        if (canProceed === false) {
            webviewPanel.dispose();
            return;
        }

        const jsonContent = JSON.stringify(result.erdDocument.toJSON(), null, 4);
        await vscode.workspace.fs.writeFile(erdUri, Buffer.from(jsonContent, 'utf-8'));

        reportConversionSummaries(path.basename(erdUri.fsPath), result.summaries);

        await vscode.commands.executeCommand('vscode.openWith', erdUri, ERD_EDITOR_VIEW_TYPE);

        webviewPanel.dispose();
    } catch (error) {
        // doExistsFile は FileNotFound 以外を再送出するため (権限エラー等)、ここで捕捉してユーザーに見える形にする。
        // サイレントに失敗させると webviewPanel が "Converting…" 表示のまま残ってしまう。
        const message = `Failed to import "${path.basename(textDocument.uri.fsPath)}": ${error}`;
        vscode.window.showErrorMessage(message);
        webviewPanel.webview.html = initReportHtml(message, result.summaries);
    }
};

const toErdUri = (ermUri: vscode.Uri, documentName: string): vscode.Uri => {
    const directory = path.dirname(ermUri.fsPath);
    return vscode.Uri.file(path.join(directory, `${documentName}.erd`));
};

// 同名の .erd が既存の場合は上書き確認を挟む。既存の設計成果を無言で失わないため。
const confirmOverwriteIfExists = async (erdUri: vscode.Uri): Promise<boolean> => {
    const exists = await doExistsFile(erdUri);
    if (exists === false) {
        return true;
    }

    const selection = await vscode.window.showWarningMessage(
        `"${path.basename(erdUri.fsPath)}" already exists. Overwrite it with the converted diagram?`,
        { modal: true }, 'Overwrite'
    );

    return selection === 'Overwrite';
};

const doExistsFile = async (uri: vscode.Uri): Promise<boolean> => {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch (error) {
        if ((error instanceof vscode.FileSystemError) && (error.code === "FileNotFound")) {
            return false;
        }
        throw error;
    }
};

const MAX_REPORTED_SUMMARIES_IN_TOAST = 5;

// 変換レポートは Webview のタブが閉じられると見えなくなるため、通知トーストに要点を残す。
const reportConversionSummaries = (erdFileName: string, summaries: ErmLoadSummary[]): void => {
    const reportedSummaries = summaries.filter(summary => (summary.result !== 'success'));
    if (reportedSummaries.length === 0) {
        vscode.window.showInformationMessage(`Imported "${erdFileName}".`);
        return;
    }

    const shownItems = reportedSummaries.slice(0, MAX_REPORTED_SUMMARIES_IN_TOAST)
        .map(summary => `[${summary.result}] ${summary.target}: ${summary.message}`)
        .join(' / ');
    const remainingCount = reportedSummaries.length - MAX_REPORTED_SUMMARIES_IN_TOAST;
    const remainingSuffix = (remainingCount > 0) ? ` (and ${remainingCount} more)` : '';

    vscode.window.showWarningMessage(
        `Imported "${erdFileName}" with ${reportedSummaries.length} item(s) not fully converted: `
        + `${shownItems}${remainingSuffix}`
    );
};

const initReportHtml = (headline: string, summaries: ErmLoadSummary[]): string => {
    const items = summaries
        .map(summary => `<li><code>[${escapeHtml(summary.result)}]</code>` +
            ` ${escapeHtml(summary.target)}: ${escapeHtml(summary.message)}</li>`)
        .join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
        body { font-family: sans-serif; padding: 16px; }
        li { margin-bottom: 4px; }
    </style>
</head>
<body>
    <p>${escapeHtml(headline)}</p>
    ${(items !== "") ? `<ul>${items}</ul>` : ""}
</body>
</html>`;
};

const escapeHtml = (value: string): string => {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
};
