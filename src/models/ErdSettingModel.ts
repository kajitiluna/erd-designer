import DisplayNameStyle from "~/models/DisplayNameStyle";
import DisplayColumnStyle from "~/models/DisplayColumnStyle";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";
import PerspectiveModel from "~/models/PerspectiveModel";
import PerspectiveModelStorage from "~/models/PerspectiveModelStorage";
import { requireProperty, toObjects } from "~/models/util";

type ErdSettingModelOptions = {
    displayNameStyle?: DisplayNameStyle,
    displayColumnStyle?: DisplayColumnStyle,
    exportDdlSetting: ExportDdlSettingModel,
    perspectiveModelStorage: PerspectiveModelStorage,
    showRelationNames?: boolean,
    syncRemoteChanges?: boolean
};

type UpdatingArgs = {
    displayNameStyle?: DisplayNameStyle | null,
    displayColumnStyle?: DisplayColumnStyle | null,
    exportDdlSetting?: ExportDdlSettingModel | null,
    perspectiveModels?: PerspectiveModel[] | null,
    showRelationNames?: boolean | null,
    syncRemoteChanges?: boolean | null
};

export default class ErdSettingModel {

    public readonly displayNameStyle: DisplayNameStyle;
    public readonly displayColumnStyle: DisplayColumnStyle;
    public readonly exportDdlSetting: ExportDdlSettingModel;
    private readonly perspectiveModelStorage: PerspectiveModelStorage;
    public readonly showRelationNames: boolean;
    public readonly syncRemoteChanges: boolean;

    private constructor({
        displayNameStyle = DisplayNameStyle.BOTH, displayColumnStyle = DisplayColumnStyle.ALL,
        exportDdlSetting, perspectiveModelStorage,
        showRelationNames = false, syncRemoteChanges = false
    }: ErdSettingModelOptions) {
        this.displayNameStyle = displayNameStyle;
        this.displayColumnStyle = displayColumnStyle;
        this.exportDdlSetting = exportDdlSetting;
        this.perspectiveModelStorage = perspectiveModelStorage;
        this.showRelationNames = showRelationNames;
        this.syncRemoteChanges = syncRemoteChanges;
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
        displayNameStyle = null, displayColumnStyle = null, exportDdlSetting = null, perspectiveModels = null,
        showRelationNames = null, syncRemoteChanges = null
    }: UpdatingArgs): ErdSettingModel {

        if ((displayNameStyle == null) && (displayColumnStyle == null)
            && (exportDdlSetting == null) && (perspectiveModels == null)
            && (showRelationNames == null) && (syncRemoteChanges == null)) {
            return this;
        }

        return new ErdSettingModel({
            displayNameStyle: ((displayNameStyle != null) ? displayNameStyle : this.displayNameStyle),
            displayColumnStyle: ((displayColumnStyle != null) ? displayColumnStyle : this.displayColumnStyle),
            exportDdlSetting: ((exportDdlSetting != null) ? exportDdlSetting : this.exportDdlSetting),
            perspectiveModelStorage: ((perspectiveModels != null)
                ? new PerspectiveModelStorage(perspectiveModels) : this.perspectiveModelStorage),
            showRelationNames: ((showRelationNames != null) ? showRelationNames : this.showRelationNames),
            syncRemoteChanges: ((syncRemoteChanges != null) ? syncRemoteChanges : this.syncRemoteChanges)
        });
    }

    public updatePerspective(updating: PerspectiveModel): ErdSettingModel {
        const nextPerspectiveStorage = this.perspectiveModelStorage.updateModel(updating);
        if (nextPerspectiveStorage === this.perspectiveModelStorage) {
            return this;
        }

        return new ErdSettingModel({
            displayNameStyle: this.displayNameStyle,
            displayColumnStyle: this.displayColumnStyle,
            exportDdlSetting: this.exportDdlSetting,
            perspectiveModelStorage: nextPerspectiveStorage,
            showRelationNames: this.showRelationNames,
            syncRemoteChanges: this.syncRemoteChanges
        });
    }

    public toJSON(): Record<string, unknown> {
        const perspectiveModels = this.perspectiveModelStorage.getModels().map(model => model.toJSON());

        return {
            displayStyle: this.displayNameStyle.toJSON(),
            ...((this.displayColumnStyle.key !== DisplayColumnStyle.ALL.key) && {
                displayColumn: this.displayColumnStyle.toJSON()
            }),
            exportDdlSetting: this.exportDdlSetting.toJSON(),
            ...((perspectiveModels.length > 0) && { perspectiveModels: perspectiveModels }),
            ...(this.showRelationNames && { showRelationNames: true }),
            ...(this.syncRemoteChanges && { syncRemoteChanges: true })
        };
    }

    public static toObject(obj: object): ErdSettingModel {
        requireProperty(obj, "exportDdlSetting");

        const displayNameStyle = ("displayStyle" in obj)
            ? DisplayNameStyle.toObject(obj.displayStyle as object) : DisplayNameStyle.BOTH;
        const displayColumnStyle = ("displayColumn" in obj)
            ? DisplayColumnStyle.toObject(obj.displayColumn as object) : DisplayColumnStyle.ALL;
        const exportDdlSetting = ExportDdlSettingModel.toObject(obj.exportDdlSetting as object)
        const perspectiveModels = ("perspectiveModels" in obj)
            ? toObjects(obj.perspectiveModels, "perspectiveModels", value => PerspectiveModel.toObject(value)) : [];

        const showRelationNames = ("showRelationNames" in obj) ? obj.showRelationNames as boolean : false;
        const syncRemoteChanges = ("syncRemoteChanges" in obj) ? obj.syncRemoteChanges as boolean : false;

        return new ErdSettingModel({
            displayNameStyle,
            displayColumnStyle,
            exportDdlSetting,
            perspectiveModelStorage: new PerspectiveModelStorage(perspectiveModels),
            showRelationNames,
            syncRemoteChanges
        });
    }

    public equals(other: ErdSettingModel): boolean {
        if (this.displayNameStyle.equals(other.displayNameStyle) === false) {
            return false;
        }
        if (this.displayColumnStyle.equals(other.displayColumnStyle) === false) {
            return false;
        }
        if (this.exportDdlSetting.equals(other.exportDdlSetting) === false) {
            return false;
        }
        if (this.perspectiveModelStorage.equals(other.perspectiveModelStorage) === false) {
            return false;
        }
        if (this.showRelationNames !== other.showRelationNames) {
            return false;
        }
        if (this.syncRemoteChanges !== other.syncRemoteChanges) {
            return false;
        }

        return true;
    }
}