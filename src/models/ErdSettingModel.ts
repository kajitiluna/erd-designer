import DisplayStyle from "~/models/database/DisplayStyle";
import { PropertyNotExistsError } from "~/models/exceptions";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";
import PerspectiveModel from "~/models/PerspectiveModel";
import PerspectiveModelStorage from "~/models/PerspectiveModelStorage";
import { toObjects } from "~/models/util";

type ErdSettingModelOptions = {
    displayStyle?: DisplayStyle,
    exportDdlSetting: ExportDdlSettingModel,
    perspectiveModelStorage: PerspectiveModelStorage,
    showRelationNames?: boolean,
    roundedOrthogonalCorners?: boolean
};

type UpdatingArgs = {
    displayStyle?: DisplayStyle | null,
    exportDdlSetting?: ExportDdlSettingModel | null,
    perspectiveModels?: PerspectiveModel[] | null,
    showRelationNames?: boolean | null,
    roundedOrthogonalCorners?: boolean | null
};

export default class ErdSettingModel {

    public readonly displayStyle: DisplayStyle;
    public readonly exportDdlSetting: ExportDdlSettingModel;
    private readonly perspectiveModelStorage: PerspectiveModelStorage;
    public readonly showRelationNames: boolean;
    public readonly roundedOrthogonalCorners: boolean;

    private constructor({
        displayStyle = DisplayStyle.BOTH, exportDdlSetting, perspectiveModelStorage, showRelationNames = false, roundedOrthogonalCorners = false
    }: ErdSettingModelOptions) {
        this.displayStyle = displayStyle;
        this.exportDdlSetting = exportDdlSetting;
        this.perspectiveModelStorage = perspectiveModelStorage;
        this.showRelationNames = showRelationNames;
        this.roundedOrthogonalCorners = roundedOrthogonalCorners;
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
        displayStyle = null, exportDdlSetting = null, perspectiveModels = null, showRelationNames = null, roundedOrthogonalCorners = null
    }: UpdatingArgs): ErdSettingModel {

        if ((displayStyle == null) && (exportDdlSetting == null) && (perspectiveModels == null) && (showRelationNames == null) && (roundedOrthogonalCorners == null)) {
            return this;
        }

        return new ErdSettingModel({
            displayStyle: ((displayStyle != null) ? displayStyle : this.displayStyle),
            exportDdlSetting: ((exportDdlSetting != null) ? exportDdlSetting : this.exportDdlSetting),
            perspectiveModelStorage: ((perspectiveModels != null)
                ? new PerspectiveModelStorage(perspectiveModels) : this.perspectiveModelStorage),
            showRelationNames: ((showRelationNames != null) ? showRelationNames : this.showRelationNames),
            roundedOrthogonalCorners: ((roundedOrthogonalCorners != null) ? roundedOrthogonalCorners : this.roundedOrthogonalCorners)
        });
    }

    public updatePerspective(updating: PerspectiveModel): ErdSettingModel {
        const nextPerspectiveStorage = this.perspectiveModelStorage.updateModel(updating);
        if (nextPerspectiveStorage === this.perspectiveModelStorage) {
            return this;
        }

        return new ErdSettingModel({
            displayStyle: this.displayStyle,
            exportDdlSetting: this.exportDdlSetting,
            perspectiveModelStorage: nextPerspectiveStorage,
            showRelationNames: this.showRelationNames,
            roundedOrthogonalCorners: this.roundedOrthogonalCorners
        });
    }

    public toJSON(): Record<string, unknown> {
        const perspectiveModels = this.perspectiveModelStorage.getModels().map(model => model.toJSON());

        return {
            displayStyle: this.displayStyle.toJSON(),
            exportDdlSetting: this.exportDdlSetting.toJSON(),
            ...((perspectiveModels.length > 0) && { perspectiveModels: perspectiveModels }),
            ...(this.showRelationNames && { showRelationNames: true }),
            ...(this.roundedOrthogonalCorners && { roundedOrthogonalCorners: true })
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

        const showRelationNames = ("showRelationNames" in obj) ? obj.showRelationNames as boolean : false;
        const roundedOrthogonalCorners = ("roundedOrthogonalCorners" in obj)
            ? (obj.roundedOrthogonalCorners === true) : false;

        return new ErdSettingModel({
            displayStyle,
            exportDdlSetting,
            perspectiveModelStorage: new PerspectiveModelStorage(perspectiveModels),
            showRelationNames,
            roundedOrthogonalCorners
        });
    }

    public equals(other: ErdSettingModel): boolean {
        if (!this.displayStyle.equals(other.displayStyle)) {
            return false;
        }
        if (!this.exportDdlSetting.equals(other.exportDdlSetting)) {
            return false;
        }
        if (!this.perspectiveModelStorage.equals(other.perspectiveModelStorage)) {
            return false;
        }
        if (this.showRelationNames !== other.showRelationNames) {
            return false;
        }
        if (this.roundedOrthogonalCorners !== other.roundedOrthogonalCorners) {
            return false;
        }

        return true;
    }
}