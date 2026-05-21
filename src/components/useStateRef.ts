import React from "react";

const useStateRef = <ELEMENT>():[ELEMENT | null, (el: ELEMENT | null) => void] => {
    const [element, setElement] = React.useState<ELEMENT | null>(null);
    const elementRef = React.useCallback((el: ELEMENT | null) => setElement(el), []);

    return [element, elementRef];
};

export default useStateRef;
