import DisplayStyle from "~/models/database/DisplayStyle";
import { PropertyNotExistsError } from "~/models/exceptions";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";

type ErdSettingType = {
    displayStyle?: DisplayStyle,
    exportDdlSetting: ExportDdlSettingModel
};

type UpdatingArgs = {
    displayStyle?: DisplayStyle | null,
    exportDdlSetting?: ExportDdlSettingModel | null
};

export default class ErdSettingModel {

    public readonly displayStyle: DisplayStyle;
    public readonly exportDdlSetting: ExportDdlSettingModel;

    constructor({ displayStyle = DisplayStyle.BOTH, exportDdlSetting }: ErdSettingType) {
        this.displayStyle = displayStyle;
        this.exportDdlSetting = exportDdlSetting;
    }

    public static create(documentName: string): ErdSettingModel {
        const exportDdlSetting = new ExportDdlSettingModel({ fileName: documentName });
        return new ErdSettingModel({ exportDdlSetting });
    }

    public update({ displayStyle = null, exportDdlSetting = null }: UpdatingArgs): ErdSettingModel {
        if ((displayStyle == null) && (exportDdlSetting == null)) {
            return this;
        }

        return new ErdSettingModel({
            displayStyle: ((displayStyle != null) ? displayStyle : this.displayStyle),
            exportDdlSetting: ((exportDdlSetting != null) ? exportDdlSetting : this.exportDdlSetting)
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            displayStyle: this.displayStyle.toJSON(),
            exportDdlSetting: this.exportDdlSetting.toJSON()
        };
    }

    public static toObject(obj: object): ErdSettingModel {
        if (!("exportDdlSetting" in obj)) {
            throw new PropertyNotExistsError("exportDdlSetting", obj);
        }

        const displayStyle = ("displayStyle" in obj)
            ? DisplayStyle.toObject(obj.displayStyle as object) : DisplayStyle.BOTH;
        const exportDdlSetting = ExportDdlSettingModel.toObject(obj.exportDdlSetting as object)

        return new ErdSettingModel({
            displayStyle,
            exportDdlSetting
        });
    }
}