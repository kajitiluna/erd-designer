import { DuplicateName } from '~/models/util';

describe('DuplicateName', () => {
    describe('resolve', () => {
        test('使用済みでなければ _copy を付ける', () => {
            expect(DuplicateName.resolve('users', new Set(['users']))).toBe('users_copy');
        });

        test('_copy が使用済みなら _copy2、さらに使用済みなら _copy3 になる', () => {
            expect(DuplicateName.resolve('users', new Set(['users_copy']))).toBe('users_copy2');
            expect(DuplicateName.resolve('users', new Set(['users_copy', 'users_copy2']))).toBe('users_copy3');
        });

        test('空の名前は空のまま返す', () => {
            expect(DuplicateName.resolve('', new Set(['', '_copy']))).toBe('');
        });
    });

    describe('resolveEach', () => {
        test('同じ名前の複数エントリも互いに衝突せず、使用済み集合に追加される', () => {
            const result = DuplicateName.resolveEach(
                [{ id: 'first', name: 'idx' }, { id: 'second', name: 'idx' }, { id: 'third', name: '' }],
                new Set(['idx'])
            );

            expect(result.sourceIdToDuplicatedNames.get('first')).toBe('idx_copy');
            expect(result.sourceIdToDuplicatedNames.get('second')).toBe('idx_copy2');
            expect(result.sourceIdToDuplicatedNames.get('third')).toBe('');
            expect(result.usedNames.has('idx_copy')).toBe(true);
            expect(result.usedNames.has('idx_copy2')).toBe(true);
        });

        test('引数の使用済み集合は変更されない', () => {
            const usedNames = new Set(['idx']);

            DuplicateName.resolveEach([{ id: 'first', name: 'idx' }], usedNames);

            expect(Array.from(usedNames)).toEqual(['idx']);
        });
    });
});
