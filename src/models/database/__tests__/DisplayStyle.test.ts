import DisplayStyle from '../DisplayStyle';

describe('DisplayStyle', () => {
    describe('constants', () => {
        test('PHYSICAL should display physical name only', () => {
            const style = DisplayStyle.PHYSICAL;
            expect(style.name).toBe('Physical');
            expect(style.displayName('physical_name', 'Logical Name'))
                .toBe('physical_name');
        });

        test('LOGICAL should display logical name only', () => {
            const style = DisplayStyle.LOGICAL;
            expect(style.name).toBe('Logical');
            expect(style.displayName('physical_name', 'Logical Name'))
                .toBe('Logical Name');
        });

        test('BOTH should display both names', () => {
            const style = DisplayStyle.BOTH;
            expect(style.name).toBe('Both');
            expect(style.displayName('physical_name', 'Logical Name'))
                .toBe('Logical Name / physical_name');
        });
    });

    describe('values', () => {
        test('should return all display styles', () => {
            const values = DisplayStyle.values();
            expect(values).toHaveLength(3);
            expect(values).toContain(DisplayStyle.PHYSICAL);
            expect(values).toContain(DisplayStyle.LOGICAL);
            expect(values).toContain(DisplayStyle.BOTH);
        });
    });

    describe('serialization', () => {
        test('toJSON should return style name', () => {
            expect(DisplayStyle.PHYSICAL.toJSON()).toEqual({ styleName: 'Physical' });
            expect(DisplayStyle.LOGICAL.toJSON()).toEqual({ styleName: 'Logical' });
            expect(DisplayStyle.BOTH.toJSON()).toEqual({ styleName: 'Both' });
        });

        test('toObject should restore from style name', () => {
            expect(DisplayStyle.toObject({ styleName: 'Physical' })).toBe(DisplayStyle.PHYSICAL);
            expect(DisplayStyle.toObject({ styleName: 'Logical' })).toBe(DisplayStyle.LOGICAL);
            expect(DisplayStyle.toObject({ styleName: 'Both' })).toBe(DisplayStyle.BOTH);
        });

        test('toObject should return BOTH for invalid input', () => {
            expect(DisplayStyle.toObject({})).toBe(DisplayStyle.BOTH);
            expect(DisplayStyle.toObject({ styleName: 'Invalid' })).toBe(DisplayStyle.BOTH);
        });
    });
});