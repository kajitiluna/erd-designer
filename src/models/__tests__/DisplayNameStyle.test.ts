import DisplayNameStyle from '../DisplayNameStyle';

describe('DisplayStyle', () => {
    describe('constants', () => {
        test('PHYSICAL should display physical name only', () => {
            const style = DisplayNameStyle.PHYSICAL;
            expect(style.name).toBe('Physical');
            expect(style.displayName('physical_name', 'Logical Name'))
                .toBe('physical_name');
        });

        test('LOGICAL should display logical name only', () => {
            const style = DisplayNameStyle.LOGICAL;
            expect(style.name).toBe('Logical');
            expect(style.displayName('physical_name', 'Logical Name'))
                .toBe('Logical Name');
        });

        test('BOTH should display both names', () => {
            const style = DisplayNameStyle.BOTH;
            expect(style.name).toBe('Both');
            expect(style.displayName('physical_name', 'Logical Name'))
                .toBe('Logical Name / physical_name');
        });
    });

    describe('values', () => {
        test('should return all display styles', () => {
            const values = DisplayNameStyle.values();
            expect(values).toHaveLength(3);
            expect(values).toContain(DisplayNameStyle.PHYSICAL);
            expect(values).toContain(DisplayNameStyle.LOGICAL);
            expect(values).toContain(DisplayNameStyle.BOTH);
        });
    });

    describe('serialization', () => {
        test('toJSON should return style name', () => {
            expect(DisplayNameStyle.PHYSICAL.toJSON()).toEqual({ styleName: 'Physical' });
            expect(DisplayNameStyle.LOGICAL.toJSON()).toEqual({ styleName: 'Logical' });
            expect(DisplayNameStyle.BOTH.toJSON()).toEqual({ styleName: 'Both' });
        });

        test('toObject should restore from style name', () => {
            expect(DisplayNameStyle.toObject({ styleName: 'Physical' })).toBe(DisplayNameStyle.PHYSICAL);
            expect(DisplayNameStyle.toObject({ styleName: 'Logical' })).toBe(DisplayNameStyle.LOGICAL);
            expect(DisplayNameStyle.toObject({ styleName: 'Both' })).toBe(DisplayNameStyle.BOTH);
        });

        test('toObject should return BOTH for invalid input', () => {
            expect(DisplayNameStyle.toObject({})).toBe(DisplayNameStyle.BOTH);
            expect(DisplayNameStyle.toObject({ styleName: 'Invalid' })).toBe(DisplayNameStyle.BOTH);
        });
    });
});