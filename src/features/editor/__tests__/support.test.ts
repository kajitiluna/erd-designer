import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColumnModelStorage from '~/models/ColumnModelStorage';
import ColumnShareModelStorage from '~/models/ColumnShareModelStorage';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnType from '~/models/database/ColumnType';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import { ColumnWrapModel, initializeValidateNonRecursive, validateNameColumnWraps } from '~/features/editor/support';

const initDocument = (args: {
    columnGroupModels?: ColumnGroupModel[],
    columnModels?: ColumnModel[]
}): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel: ErdSettingModel.create('test-document'),
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        columnGroupModels: args.columnGroupModels ?? [],
        columnModels: args.columnModels ?? []
    });
};

// struct バリアントのラッパー ColumnModel を生成する。
const initStructWrapper = (
    columnModelId: string, structShareModelId: string, notNull: boolean = false
): StructColumnModel => {
    return new StructColumnModel({ columnModelId, structShareModelId, notNull });
};

const toStructWrap = (columnModel: StructColumnModel): ColumnWrapModel => {
    return { modelType: "struct", columnModel };
};

const toSingleWrap = (columnModel: SimpleColumnModel): ColumnWrapModel => {
    return { modelType: "single", columnModel };
};

const toGroupWrap = (columnGroupModel: ColumnGroupModel, columnModels: SimpleColumnModel[]): ColumnWrapModel => {
    return { modelType: "group", columnGroupModel, columnModels };
};

describe('support', () => {
    describe('initializeValidateNonRecursive', () => {
        test('should allow siblings referencing the same struct share', () => {
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'address', columnEntries: []
            });
            const wrapperFirst = initStructWrapper('wrapper-1', 'struct-a');
            const wrapperSecond = initStructWrapper('wrapper-2', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperFirst), toStructWrap(wrapperSecond)];

            expect(validateNonRecursive(columnWrapModels)).toBe(true);
        });

        test('should allow the same struct share to appear twice within one struct', () => {
            const wrapperB1 = initStructWrapper('wrapper-b1', 'struct-b');
            const wrapperB2 = initStructWrapper('wrapper-b2', 'struct-b');
            const structB = new StructColumnShareModel({
                structShareModelId: 'struct-b', physicalName: 'b', columnEntries: []
            });
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a', columnEntries: [
                    { modelType: 'single', columnModelId: 'wrapper-b1' },
                    { modelType: 'single', columnModelId: 'wrapper-b2' }
                ]
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA, structB]);
            const columnStorage = ColumnModelStorage.create([wrapperB1, wrapperB2]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels)).toBe(true);
        });

        test('should allow diamond-shaped struct sharing (A -> {B, C}, B -> D, C -> D)', () => {
            const wrapperDInB = initStructWrapper('wrapper-d-in-b', 'struct-d');
            const wrapperDInC = initStructWrapper('wrapper-d-in-c', 'struct-d');
            const structD = new StructColumnShareModel({
                structShareModelId: 'struct-d', physicalName: 'd', columnEntries: []
            });
            const wrapperB = initStructWrapper('wrapper-b', 'struct-b');
            const wrapperC = initStructWrapper('wrapper-c', 'struct-c');
            const structB = new StructColumnShareModel({
                structShareModelId: 'struct-b', physicalName: 'b',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-d-in-b' }]
            });
            const structC = new StructColumnShareModel({
                structShareModelId: 'struct-c', physicalName: 'c',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-d-in-c' }]
            });
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a', columnEntries: [
                    { modelType: 'single', columnModelId: 'wrapper-b' },
                    { modelType: 'single', columnModelId: 'wrapper-c' }
                ]
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA, structB, structC, structD]);
            const columnStorage = ColumnModelStorage.create([wrapperB, wrapperC, wrapperDInB, wrapperDInC]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels)).toBe(true);
        });

        test('should reject direct self reference (A -> A)', () => {
            const wrapperSelf = initStructWrapper('wrapper-self', 'struct-a');
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-self' }]
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([wrapperSelf]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels)).toBe(false);
        });

        test('should reject indirect recursion (A -> B -> A)', () => {
            const wrapperAInB = initStructWrapper('wrapper-a-in-b', 'struct-a');
            const structB = new StructColumnShareModel({
                structShareModelId: 'struct-b', physicalName: 'b',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-a-in-b' }]
            });
            const wrapperBInA = initStructWrapper('wrapper-b-in-a', 'struct-b');
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-b-in-a' }]
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA, structB]);
            const columnStorage = ColumnModelStorage.create([wrapperBInA, wrapperAInB]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels)).toBe(false);
        });

        test('should reject recursion reached through a column group member', () => {
            const wrapperSelfViaGroup = initStructWrapper('wrapper-self-via-group', 'struct-a');
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['wrapper-self-via-group']
            });
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a',
                columnEntries: [{ modelType: 'group', columnGroupId: 'group-1' }]
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({ columnGroupModels: [groupModel] });
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([wrapperSelfViaGroup]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels)).toBe(false);
        });

        test('should reject when the referenced struct share is not registered', () => {
            const wrapperUnregistered = initStructWrapper('wrapper-unregistered', 'struct-missing');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], []);
            const columnStorage = ColumnModelStorage.create([]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperUnregistered)];

            expect(validateNonRecursive(columnWrapModels)).toBe(false);
        });

        test('should reject when a member references the owning struct passed via ownerStructShareIds', () => {
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a', columnEntries: []
            });
            const wrapperMemberSelf = initStructWrapper('wrapper-member-self', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperMemberSelf)];

            expect(validateNonRecursive(columnWrapModels, ['struct-a'])).toBe(false);
        });

        test('should not be affected by unrelated ownerStructShareIds', () => {
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a', columnEntries: []
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels, ['struct-unrelated'])).toBe(true);
        });

        test('should return the same result when the same closure is invoked twice', () => {
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a', columnEntries: []
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            const firstResult = validateNonRecursive(columnWrapModels);
            const secondResult = validateNonRecursive(columnWrapModels);

            expect(firstResult).toBe(true);
            expect(secondResult).toBe(true);
        });

        test('should resolve an uncommitted wrapper that exists only in columnStorage and detect its recursion', () => {
            const wrapperUncommitted = initStructWrapper('wrapper-uncommitted', 'struct-a');
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'a',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-uncommitted' }]
            });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            // wrapperUncommitted はあえて erdDocument には含めず、columnStorage のみに置く
            // (struct 編集セッション中でまだ document へコミットされていない状態を再現する)。
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], [structA]);
            const columnStorage = ColumnModelStorage.create([wrapperUncommitted]);

            const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
            const columnWrapModels = [toStructWrap(wrapperA)];

            expect(validateNonRecursive(columnWrapModels)).toBe(false);
        });
    });

    describe('validateNameColumnWraps', () => {
        test('should reject duplicate physicalName between simple columns at the same level', () => {
            const shareFirst = new ColumnShareModel({
                columnShareModelId: 'share-1', physicalName: 'name', logicalName: 'Name', columnType: ColumnType.EMPTY
            });
            const shareSecond = new ColumnShareModel({
                columnShareModelId: 'share-2', physicalName: 'name', logicalName: 'Name2', columnType: ColumnType.EMPTY
            });
            const columnFirst = new SimpleColumnModel({ columnModelId: 'col-1', columnShareModelId: 'share-1' });
            const columnSecond = new SimpleColumnModel({ columnModelId: 'col-2', columnShareModelId: 'share-2' });
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([shareFirst, shareSecond], []);
            const columnWrapModels = [toSingleWrap(columnFirst), toSingleWrap(columnSecond)];

            expect(validateNameColumnWraps(columnWrapModels, erdDocument, columnShareStorage)).toBe(false);
        });

        test('should reject duplicate physicalName between a simple column and a struct column', () => {
            const columnShare = new ColumnShareModel({
                columnShareModelId: 'share-x', physicalName: 'addr', logicalName: 'Addr', columnType: ColumnType.EMPTY
            });
            const simpleColumn = new SimpleColumnModel({ columnModelId: 'col-x', columnShareModelId: 'share-x' });
            const structShare = new StructColumnShareModel({
                structShareModelId: 'struct-x', physicalName: 'addr', columnEntries: []
            });
            const structColumn = initStructWrapper('wrapper-x', 'struct-x');
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([columnShare], [structShare]);
            const columnWrapModels = [toSingleWrap(simpleColumn), toStructWrap(structColumn)];

            expect(validateNameColumnWraps(columnWrapModels, erdDocument, columnShareStorage)).toBe(false);
        });

        test('should reject duplicate physicalName including a column group member at the same level', () => {
            const shareMember = new ColumnShareModel({
                columnShareModelId: 'share-member', physicalName: 'dup', logicalName: 'Dup', columnType: ColumnType.EMPTY
            });
            const groupMemberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: 'share-member' });
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['member-1']
            });
            const shareTop = new ColumnShareModel({
                columnShareModelId: 'share-top', physicalName: 'dup', logicalName: 'Dup2', columnType: ColumnType.EMPTY
            });
            const topColumn = new SimpleColumnModel({ columnModelId: 'col-top', columnShareModelId: 'share-top' });
            const erdDocument = initDocument({ columnModels: [groupMemberColumn] });
            const columnShareStorage = ColumnShareModelStorage.create([shareMember, shareTop], []);
            const columnWrapModels = [toSingleWrap(topColumn), toGroupWrap(groupModel, [groupMemberColumn])];

            expect(validateNameColumnWraps(columnWrapModels, erdDocument, columnShareStorage)).toBe(false);
        });

        test('should allow columns with distinct physicalName', () => {
            const shareAlpha = new ColumnShareModel({
                columnShareModelId: 'share-alpha', physicalName: 'alpha', logicalName: 'Alpha', columnType: ColumnType.EMPTY
            });
            const shareBeta = new ColumnShareModel({
                columnShareModelId: 'share-beta', physicalName: 'beta', logicalName: 'Beta', columnType: ColumnType.EMPTY
            });
            const columnAlpha = new SimpleColumnModel({ columnModelId: 'col-alpha', columnShareModelId: 'share-alpha' });
            const columnBeta = new SimpleColumnModel({ columnModelId: 'col-beta', columnShareModelId: 'share-beta' });
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([shareAlpha, shareBeta], []);
            const columnWrapModels = [toSingleWrap(columnAlpha), toSingleWrap(columnBeta)];

            expect(validateNameColumnWraps(columnWrapModels, erdDocument, columnShareStorage)).toBe(true);
        });

        test('should allow a column-side override name to avoid a share name collision', () => {
            const shareShared = new ColumnShareModel({
                columnShareModelId: 'share-shared', physicalName: 'dup', logicalName: 'Dup', columnType: ColumnType.EMPTY
            });
            const columnWithoutOverride = new SimpleColumnModel({
                columnModelId: 'col-1', columnShareModelId: 'share-shared'
            });
            const columnWithOverride = new SimpleColumnModel({
                columnModelId: 'col-2', columnShareModelId: 'share-shared', physicalName: 'dup_override'
            });
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([shareShared], []);
            const columnWrapModels = [toSingleWrap(columnWithoutOverride), toSingleWrap(columnWithOverride)];

            expect(validateNameColumnWraps(columnWrapModels, erdDocument, columnShareStorage)).toBe(true);
        });

        test('should allow a struct column and its own member to share a name across different levels', () => {
            const structShare = new StructColumnShareModel({
                structShareModelId: 'struct-addr', physicalName: 'addr', columnEntries: []
            });
            const structColumn = initStructWrapper('wrapper-addr', 'struct-addr');
            const memberShare = new ColumnShareModel({
                columnShareModelId: 'share-member-addr', physicalName: 'addr', logicalName: 'Addr', columnType: ColumnType.EMPTY
            });
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-addr', columnShareModelId: 'share-member-addr' });
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([memberShare], [structShare]);

            const topLevelColumnWraps = [toStructWrap(structColumn)];
            const memberLevelColumnWraps = [toSingleWrap(memberColumn)];

            expect(validateNameColumnWraps(topLevelColumnWraps, erdDocument, columnShareStorage)).toBe(true);
            expect(validateNameColumnWraps(memberLevelColumnWraps, erdDocument, columnShareStorage)).toBe(true);
        });

        test('should allow an empty columnWrapModels list', () => {
            const erdDocument = initDocument({});
            const columnShareStorage = ColumnShareModelStorage.create([], []);

            expect(validateNameColumnWraps([], erdDocument, columnShareStorage)).toBe(true);
        });
    });
});
