import ColorValue from "~/models/ColorValue";
import DisplayStyle from "~/models/database/DisplayStyle";
import { PropertyNotExistsError } from "~/models/exceptions";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";

type ErdSettingType = {
    backgroundColor?: ColorValue,
    foregroundColor?: ColorValue,
    displayStyle?: DisplayStyle,
    exportDdlSetting: ExportDdlSettingModel
};

type UpdatingArgs = {
    backgroundColor?: ColorValue | null,
    foregroundColor?: ColorValue | null,
    displayStyle?: DisplayStyle | null,
    exportDdlSetting?: ExportDdlSettingModel | null
};

export default class ErdSettingModel {

    public readonly backgroundColor: ColorValue;
    public readonly foregroundColor: ColorValue;
    public readonly displayStyle: DisplayStyle;
    public readonly exportDdlSetting: ExportDdlSettingModel;

    constructor({
        backgroundColor = ColorValue.WHITE, foregroundColor = ColorValue.BLACK,
        displayStyle = DisplayStyle.BOTH, exportDdlSetting
    }: ErdSettingType) {

        this.backgroundColor = backgroundColor;
        this.foregroundColor = foregroundColor;
        this.displayStyle = displayStyle;
        this.exportDdlSetting = exportDdlSetting;
    }

    public static create(documentName: string): ErdSettingModel {
        const exportDdlSetting = new ExportDdlSettingModel({ fileName: documentName });
        return new ErdSettingModel({ exportDdlSetting });
    }

    public update({
        backgroundColor = null, foregroundColor = null, displayStyle = null, exportDdlSetting = null
    }: UpdatingArgs): ErdSettingModel {
        if ((backgroundColor == null) && (foregroundColor == null)
            && (displayStyle == null) && (exportDdlSetting == null)) {
            return this;
        }

        return new ErdSettingModel({
            backgroundColor: ((backgroundColor != null) ? backgroundColor : this.backgroundColor),
            foregroundColor: ((foregroundColor != null) ? foregroundColor : this.foregroundColor),
            displayStyle: ((displayStyle != null) ? displayStyle : this.displayStyle),
            exportDdlSetting: ((exportDdlSetting != null) ? exportDdlSetting : this.exportDdlSetting)
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            backgroundColor: this.backgroundColor.toJSON(),
            foregroundColor: this.foregroundColor.toJSON(),
            displayStyle: this.displayStyle.toJSON(),
            exportDdlSetting: this.exportDdlSetting.toJSON()
        };
    }

    public static toObject(obj: object): ErdSettingModel {
        if (!("exportDdlSetting" in obj)) {
            throw new PropertyNotExistsError("exportDdlSetting", obj);
        }

        const backgroundColor = ("backgroundColor" in obj)
            ? ColorValue.toObject(obj.backgroundColor as object) : ColorValue.WHITE;
        const foregroundColor = ("foregroundColor" in obj)
            ? ColorValue.toObject(obj.foregroundColor as object) : ColorValue.BLACK;
        const displayStyle = ("displayStyle" in obj)
            ? DisplayStyle.toObject(obj.displayStyle as object) : DisplayStyle.BOTH;
        const exportDdlSetting = ExportDdlSettingModel.toObject(obj.exportDdlSetting as object)

        return new ErdSettingModel({
            backgroundColor,
            foregroundColor,
            displayStyle,
            exportDdlSetting
        });
    }
}