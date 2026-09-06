import { describe, expect, test } from 'vitest';
import { DdlCommentOption, initDdlComment } from '~/models/schema/ddl-comment';

const LOGICAL_NAME_OPTION: DdlCommentOption = {
    withComment: true, commentStyle: 'logical_name', commentSeparator: ' : '
};

const WITH_DESCRIPTION_OPTION: DdlCommentOption = {
    withComment: true, commentStyle: 'with_description', commentSeparator: ' : '
};

describe('initDdlComment', () => {
    test('returns an empty string when comments are disabled', () => {
        const comment = initDdlComment('user_id', 'ユーザID', '', { ...LOGICAL_NAME_OPTION, withComment: false });

        expect(comment).toBe('');
    });

    test('logical_name style returns the logical name as-is', () => {
        const comment = initDdlComment('user_id', 'ユーザID', '', LOGICAL_NAME_OPTION);

        expect(comment).toBe('ユーザID');
    });

    test('a logical name equal to the physical name carries no information, so it is omitted', () => {
        const comment = initDdlComment('user_id', 'user_id', '', LOGICAL_NAME_OPTION);

        expect(comment).toBe('');
    });

    test('with_description style joins the logical name and description with the separator', () => {
        const comment = initDdlComment('gender', '性別', 'male : 男性', WITH_DESCRIPTION_OPTION);

        expect(comment).toBe('性別 : male : 男性');
    });

    test('with_description style without a description falls back to the logical name alone', () => {
        const comment = initDdlComment('user_id', 'ユーザID', '', WITH_DESCRIPTION_OPTION);

        expect(comment).toBe('ユーザID');
    });

    test('with_description style also omits the comment when the joined result equals the physical name', () => {
        const comment = initDdlComment('user_id', 'user_id', '', WITH_DESCRIPTION_OPTION);

        expect(comment).toBe('');
    });
});
