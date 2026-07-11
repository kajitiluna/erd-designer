
/**
 * ダイアログなどのコントロールパネルが表示されているかを判定する。
 * canvas 上のショートカットキー操作が行われないように制御するために使用する。
 */
export const inOpenControlPanel = () => {
    // ダイアログが表示されているときはキー操作を無視する
    // DOM 要素を直接みているため、MUI のバージョン変更時には修正が必要に可能性がある
    const dialogs = window.document.querySelectorAll('[role="dialog"]');
    const backdrops = window.document.querySelectorAll('.MuiBackdrop-root');

    return (dialogs.length > 0) || (backdrops.length > 0);
};

/**
 * テキスト入力可能な要素にフォーカスがあるかを判定する。
 * canvas 上のショートカットキー操作がテキスト入力を妨げないように制御するために使用する。
 */
export const isTextInputFocused = (): boolean => {
    const activeElement = window.document.activeElement;
    if (activeElement == null) {
        return false;
    }

    const tagName = activeElement.tagName;
    return (tagName === "INPUT") || (tagName === "TEXTAREA");
};
