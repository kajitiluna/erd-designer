import React from "react";

import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnModelStorage from "~/models/ColumnModelStorage";

type ColumnShareModelContextProps = {
    columnShareStorage: ColumnShareModelStorage,
    updateShareStorage: (storage: ColumnShareModelStorage) => void,
    columnStorage: ColumnModelStorage,
    updateColumnStorage: (updateFunction: (previous: ColumnModelStorage) => ColumnModelStorage) => void
};

export const ColumnShareModelStorageContext
    = React.createContext<ColumnShareModelContextProps>({} as ColumnShareModelContextProps);
