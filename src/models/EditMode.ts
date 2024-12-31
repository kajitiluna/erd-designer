export const EditModeType = {
    SELECT: "SELECT",
    CREATE_TABLE: "CREATE_TABLE",
    CREATE_RELATION: "CREATE_RELATION",
    CREATE_MEMO: "CREATE_MEMO",
} as const;

type EditMode = typeof EditModeType[keyof typeof EditModeType];

export default EditMode;
