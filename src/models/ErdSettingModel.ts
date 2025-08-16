import DisplayStyle from "~/models/database/DisplayStyle";
import { PropertyNotExistsError } from "~/models/exceptions";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";
import PerspectiveModel from "~/models/PerspectiveModel";
import PerspectiveModelStorage from "~/models/PerspectiveModelStorage";
import { toObjects } from "~/models/util";

type ErdSettingModelOptions = {
    displayStyle?: DisplayStyle,
    exportDdlSetting: ExportDdlSettingModel,
    perspectiveModelStorage: PerspectiveModelStorage
};

type UpdatingArgs = {
    displayStyle?: DisplayStyle | null,
    exportDdlSetting?: ExportDdlSettingModel | null,
    perspectiveModels?: PerspectiveModel[] | null
};

export default class ErdSettingModel {

    public readonly displayStyle: DisplayStyle;
    public readonly exportDdlSetting: ExportDdlSettingModel;
    private readonly perspectiveModelStorage: PerspectiveModelStorage;

    private constructor({
        displayStyle = DisplayStyle.BOTH, exportDdlSetting, perspectiveModelStorage
    }: ErdSettingModelOptions) {
        this.displayStyle = displayStyle;
        this.exportDdlSetting = exportDdlSetting;
        this.perspectiveModelStorage = perspectiveModelStorage;
    }

    public static create(documentName: string): ErdSettingModel {
        const exportDdlSetting = new ExportDdlSettingModel({ fileName: documentName });
        const perspectiveModelStorage = new PerspectiveModelStorage([]);

        return new ErdSettingModel({ exportDdlSetting, perspectiveModelStorage });
    }

    public findPerspectiveModel(perspectiveModelId: string): PerspectiveModel | null {
        return this.perspectiveModelStorage.findModel(perspectiveModelId);
    }

    public getPerspectiveModels(): PerspectiveModel[] {
        return this.perspectiveModelStorage.getModels();
    }

    public update({
        displayStyle = null, exportDdlSetting = null, perspectiveModels = null
    }: UpdatingArgs): ErdSettingModel {

        if ((displayStyle == null) && (exportDdlSetting == null) && (perspectiveModels == null)) {
            return this;
        }

        return new ErdSettingModel({
            displayStyle: ((displayStyle != null) ? displayStyle : this.displayStyle),
            exportDdlSetting: ((exportDdlSetting != null) ? exportDdlSetting : this.exportDdlSetting),
            perspectiveModelStorage: ((perspectiveModels != null)
                ? new PerspectiveModelStorage(perspectiveModels) : this.perspectiveModelStorage)
        });
    }

    public toJSON(): Record<string, unknown> {
        const perspectiveModels = this.perspectiveModelStorage.getModels().map(model => model.toJSON());

        return {
            displayStyle: this.displayStyle.toJSON(),
            exportDdlSetting: this.exportDdlSetting.toJSON(),
            ...((perspectiveModels.length > 0) && { perspectiveModels: perspectiveModels })
        };
    }

    public static toObject(obj: object): ErdSettingModel {
        if (!("exportDdlSetting" in obj)) {
            throw new PropertyNotExistsError("exportDdlSetting", obj);
        }

        const displayStyle = ("displayStyle" in obj)
            ? DisplayStyle.toObject(obj.displayStyle as object) : DisplayStyle.BOTH;
        const exportDdlSetting = ExportDdlSettingModel.toObject(obj.exportDdlSetting as object)
        const perspectiveModels = ("perspectiveModels" in obj)
            ? toObjects(obj.perspectiveModels, "perspectiveModels", value => PerspectiveModel.toObject(value)) : [];

        return new ErdSettingModel({
            displayStyle,
            exportDdlSetting,
            perspectiveModelStorage: new PerspectiveModelStorage(perspectiveModels)
        });
    }
}