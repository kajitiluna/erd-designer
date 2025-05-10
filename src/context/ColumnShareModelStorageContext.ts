import React from "react";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";

type ColumnShareModelContextProps = {
    columnShareModelStorage: ColumnShareModelStorage,
    updateStorage: (storage: ColumnShareModelStorage) => void
};

export const ColumnShareModelStorageContext
    = React.createContext<ColumnShareModelContextProps>({} as ColumnShareModelContextProps);
