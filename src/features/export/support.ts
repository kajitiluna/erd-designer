import ErdDocument from "~/models/ErdDocument";

export const escapeCdata = (text: string) => text.replace(/]]>/g, "]]\\u003E");

export const serializePerspective = (erdDocument: ErdDocument) => {
    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();

    return perspectives.map(perspective => {
        return {
            id: perspective.perspectiveId,
            name: perspective.perspectiveName,
            ids: perspective.getContainIds()
        };
    });
};
