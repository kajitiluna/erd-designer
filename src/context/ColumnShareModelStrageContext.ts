import React from "react";
import ColumnShareModelStrage from "~/models/ColumnShareModelStrage";

type ColumnShareModelContextProps = {
    columnShareModelStrage: ColumnShareModelStrage,
    updateStrage: (strage: ColumnShareModelStrage) => void
};

export const ColumnShareModelStrageContext
    = React.createContext<ColumnShareModelContextProps>({} as ColumnShareModelContextProps);
