/* eslint-disable @typescript-eslint/no-explicit-any */
interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

interface Window {
    vscodeApi?: VsCodeApi;
}