import React from "react";

// MUI Dialog stamps its own Paper with the `data-mui-focusable` attribute (see `Unstable_TrapFocus`),
// so FocusTrap always treats the Paper itself as the initial focus target
// and a plain `autoFocus` on a descendant field loses that race.
// Deferring the focus call to the next macrotask runs after FocusTrap's own commit-time focus handling,
// so it lands last. `setTimeout(0)` rather than a longer delay keeps this invisible to the user —
// unlike an arbitrary multi-hundred-ms delay, it cannot eat keystrokes typed right after open.
const useAutoFocusInput = <ELEMENT extends HTMLElement>(isOpen: boolean): React.RefObject<ELEMENT | null> => {
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

export default useAutoFocusInput;
