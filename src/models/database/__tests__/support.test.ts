import { resolveLogicalName } from '~/models/database/support';

describe('resolveLogicalName', () => {
    test('should keep the given logical name', () => {
        expect(resolveLogicalName('user_name', 'User Name')).toBe('User Name');
    });

    test('should fall back to the physical name when the logical name is empty', () => {
        expect(resolveLogicalName('user_name', '')).toBe('user_name');
    });

    test('should keep a logical name that only differs in case', () => {
        expect(resolveLogicalName('user_name', 'USER_NAME')).toBe('USER_NAME');
    });

    test('should return an empty string when neither name is given', () => {
        expect(resolveLogicalName('', '')).toBe('');
    });
});
