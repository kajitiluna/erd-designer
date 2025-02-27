import React from "react";
import ErdDocument from "~/models/ErdDocument";

type ExportSpecification = {
    exportSpecification: (erdDocument: ErdDocument, contents: ImageContent) => void
}

export type ImageContent = {
    base64Value: string,
    width: number,
    height: number
};

const ExportSpecificationContext = React.createContext<ExportSpecification>({
    exportSpecification: () => {
        console.error("ExportSpecificationContext is not initialized.");
    }
});

export default ExportSpecificationContext;