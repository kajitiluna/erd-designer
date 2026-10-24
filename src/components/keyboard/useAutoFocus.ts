import React from "react";

// 入力欄・ボタン・色見本など、開いた直後に初期フォーカスを置きたい要素に使う。
// `autoFocus` 属性は使わない: StrictMode の effect 二重実行 (setup -> cleanup -> setup) と MUI FocusTrap が組み合わさると、
// 1 回目の setup で入ったフォーカスが cleanup の復元処理で開く前の要素へ戻され、
// 2 回目の setup で Paper (`data-mui-focusable`) にフォーカスが移ってしまう。
// フォーカス呼び出しを次の macrotask に遅らせると、FocusTrap の setup / cleanup がすべて終わった後に実行され、最後に勝つ。
// `setTimeout(0)` なので、数百 ms の遅延と違い、開いた直後のキー入力を取りこぼさない。
const useAutoFocus = <ELEMENT extends HTMLElement>(isOpen: boolean): React.RefObject<ELEMENT | null> => {
    const inputRef = React.useRef<ELEMENT | null>(null);

    React.useEffect(() => {
        if (isOpen === false) {
            return;
        }

        const timeoutId = setTimeout(() => {
            if (inputRef.current == null) {
                return;
            }

            inputRef.current.focus();
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [isOpen]);

    return inputRef;
};

export default useAutoFocus;
