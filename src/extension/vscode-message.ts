import * as vscode from 'vscode';

export type MessageLevel = "INFO" | "WARN" | "ERROR";

export type ShowMessage = (level: MessageLevel, message: string) => void;

export const showVsCodeMessage: ShowMessage = (level, message) => {
    switch (level) {
        case "INFO":
            vscode.window.showInformationMessage(message);
            break;
        case "WARN":
            vscode.window.showWarningMessage(message);
            break;
        case "ERROR":
            vscode.window.showErrorMessage(message);
            break;
    }
};