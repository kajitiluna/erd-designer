import RelationModel from "~/models/database/RelationModel";

export const toRelationSummary = (documentId: string, relationModel: RelationModel) => {
    return {
        uri: `erd-designer://documents/${documentId}/relations/${relationModel.relationModelId}`,
        relationId: relationModel.relationModelId,
        relationName: relationModel.relationName,
        parentTableId: relationModel.parentTableModelId,
        parentCardinality: relationModel.parentCardinality,
        childTableId: relationModel.childTableModelId,
        childCardinality: relationModel.childCardinality,
        relationPairs: relationModel.relationPairs.map(pair => ({
            parentColumnId: pair.parentColumnModelId,
            childColumnId: pair.childColumnModelId
        })),
        onUpdateAction: relationModel.onUpdateAction,
        onDeleteAction: relationModel.onDeleteAction
    };
};