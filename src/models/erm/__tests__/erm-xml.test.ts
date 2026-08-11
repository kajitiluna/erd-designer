import { ErmParseError, ErmXmlParser } from '../erm-xml';

describe('parseErmXml', () => {
    test('should parse a minimal element tree', () => {
        const root = ErmXmlParser.parse('<diagram><zoom>1.0</zoom><x>0</x></diagram>');

        expect(root.tagName).toBe('diagram');
        expect(root.children).toHaveLength(2);
        expect(ErmXmlParser.childText(root, 'zoom')).toBe('1.0');
        expect(ErmXmlParser.childText(root, 'x')).toBe('0');
    });

    test('should parse the leading XML declaration', () => {
        const root = ErmXmlParser.parse('<?xml version="1.0" encoding="UTF-8"?>\n<diagram></diagram>');

        expect(root.tagName).toBe('diagram');
    });

    test('should tolerate comments before, inside, and after the root element (spec §1)', () => {
        const source = '<!-- leading --><diagram><!-- inside --><x>1</x></diagram><!-- trailing -->';
        const root = ErmXmlParser.parse(source);

        expect(ErmXmlParser.childText(root, 'x')).toBe('1');
    });

    test('should strip a leading BOM', () => {
        const root = ErmXmlParser.parse('﻿<diagram><x>1</x></diagram>');

        expect(ErmXmlParser.childText(root, 'x')).toBe('1');
    });

    test('should parse an empty-element tag as an element with no children and empty text', () => {
        const root = ErmXmlParser.parse('<diagram><description/></diagram>');

        const description = ErmXmlParser.findChild(root, 'description');
        expect(description).not.toBeNull();
        expect(description?.text).toBe('');
        expect(description?.children).toHaveLength(0);
    });

    test('should discard text when an element also has child elements', () => {
        const root = ErmXmlParser.parse('<diagram>\n\t<x>1</x>\n</diagram>');

        expect(root.text).toBe('');
        expect(root.children).toHaveLength(1);
    });

    describe('entity references (spec §5.1)', () => {
        test.each([
            ['&lt;', '<'],
            ['&gt;', '>'],
            ['&quot;', '"'],
            ['&apos;', "'"],
            ['&amp;', '&'],
            ['&#x0D;', '\r'],
            ['&#x0A;', '\n'],
            ['&#x09;', '\t'],
        ])('should decode %s to %s', (encoded, decoded) => {
            const root = ErmXmlParser.parse(`<diagram><description>${encoded}</description></diagram>`);

            expect(ErmXmlParser.childText(root, 'description')).toBe(decoded);
        });

        test('should decode decimal numeric character references', () => {
            const root = ErmXmlParser.parse('<diagram><description>&#65;</description></diagram>');

            expect(ErmXmlParser.childText(root, 'description')).toBe('A');
        });

        test('should not double-decode an escaped ampersand', () => {
            const root = ErmXmlParser.parse('<diagram><description>&amp;lt;</description></diagram>');

            expect(ErmXmlParser.childText(root, 'description')).toBe('&lt;');
        });

        test('should pass through an unsupported named entity literally instead of failing the whole import', () => {
            const root = ErmXmlParser.parse('<diagram><description>&nbsp;</description></diagram>');

            expect(ErmXmlParser.childText(root, 'description')).toBe('&nbsp;');
        });

        test('should pass through an unterminated entity reference literally instead of failing the whole import', () => {
            const root = ErmXmlParser.parse('<diagram><description>&amp</description></diagram>');

            expect(ErmXmlParser.childText(root, 'description')).toBe('&amp');
        });
    });

    describe('rejected constructs', () => {
        test('should reject a DOCTYPE declaration', () => {
            expect(() => ErmXmlParser.parse('<!DOCTYPE diagram><diagram></diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject a CDATA section', () => {
            expect(() => ErmXmlParser.parse('<diagram><description><![CDATA[x]]></description></diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject attributes', () => {
            expect(() => ErmXmlParser.parse('<diagram version="1"></diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject a namespace-prefixed tag name', () => {
            expect(() => ErmXmlParser.parse('<ns:diagram></ns:diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject a processing instruction other than the leading XML declaration', () => {
            expect(() => ErmXmlParser.parse('<diagram><?pi data?></diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject trailing content after the root element', () => {
            expect(() => ErmXmlParser.parse('<diagram></diagram><diagram></diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject a mismatched closing tag', () => {
            expect(() => ErmXmlParser.parse('<diagram><x>1</y></diagram>'))
                .toThrow(ErmParseError);
        });

        test('should reject an unterminated document', () => {
            expect(() => ErmXmlParser.parse('<diagram><x>1</x>'))
                .toThrow(ErmParseError);
        });

        test('should reject empty input', () => {
            expect(() => ErmXmlParser.parse(''))
                .toThrow(ErmParseError);
        });
    });

    test('should parse the annotated minimal skeleton from the format spec (appendix B), tag ordering intact', () => {
        const source = `<?xml version="1.0" encoding="UTF-8"?>
<diagram>
\t<category_index>0</category_index>
\t<zoom>1.0</zoom>
\t<settings>
\t\t<database>PostgreSQL</database>
\t\t<capital>false</capital>
\t</settings>
\t<contents>
\t\t<table>
\t\t\t<id>0</id>
\t\t\t<physical_name>users</physical_name>
\t\t\t<columns>
\t\t\t\t<normal_column>
\t\t\t\t\t<id>0</id>
\t\t\t\t\t<physical_name>id</physical_name>
\t\t\t\t</normal_column>
\t\t\t</columns>
\t\t</table>
\t</contents>
</diagram>`;

        const root = ErmXmlParser.parse(source);
        const settings = ErmXmlParser.findChild(root, 'settings');
        expect(settings).not.toBeNull();
        expect(ErmXmlParser.childText(settings as NonNullable<typeof settings>, 'database')).toBe('PostgreSQL');

        const contents = ErmXmlParser.findChild(root, 'contents');
        const tables = ErmXmlParser.findChildren(contents as NonNullable<typeof contents>, 'table');
        expect(tables).toHaveLength(1);

        const table = tables[0];
        expect(ErmXmlParser.childInt(table, 'id', -1)).toBe(0);
        expect(ErmXmlParser.childText(table, 'physical_name')).toBe('users');

        const columns = ErmXmlParser.findChild(table, 'columns');
        const normalColumns = ErmXmlParser.findChildren(columns as NonNullable<typeof columns>, 'normal_column');
        expect(normalColumns).toHaveLength(1);
        expect(ErmXmlParser.childInt(normalColumns[0], 'id', -1)).toBe(0);
        expect(ErmXmlParser.childText(normalColumns[0], 'physical_name')).toBe('id');
    });
});

describe('childInt', () => {
    test('should return the default when the element is absent', () => {
        const root = ErmXmlParser.parse('<diagram></diagram>');

        expect(ErmXmlParser.childInt(root, 'zoom', 42)).toBe(42);
    });

    test('should return the default when the element text is empty', () => {
        const root = ErmXmlParser.parse('<diagram><zoom></zoom></diagram>');

        expect(ErmXmlParser.childInt(root, 'zoom', 42)).toBe(42);
    });

    test('should return the default when the element text is not a number', () => {
        const root = ErmXmlParser.parse('<diagram><zoom>abc</zoom></diagram>');

        expect(ErmXmlParser.childInt(root, 'zoom', 42)).toBe(42);
    });

    test('should parse a negative integer', () => {
        const root = ErmXmlParser.parse('<diagram><x>-40</x></diagram>');

        expect(ErmXmlParser.childInt(root, 'x', 0)).toBe(-40);
    });
});

describe('childBoolean', () => {
    test('should return the default when the element is absent', () => {
        const root = ErmXmlParser.parse('<diagram></diagram>');

        expect(ErmXmlParser.childBoolean(root, 'capital', true)).toBe(true);
    });

    test('should return true only for a case-insensitive "true" (spec §5.2)', () => {
        const root = ErmXmlParser.parse('<diagram><a>True</a><b>false</b><c>yes</c></diagram>');

        expect(ErmXmlParser.childBoolean(root, 'a', false)).toBe(true);
        expect(ErmXmlParser.childBoolean(root, 'b', true)).toBe(false);
        expect(ErmXmlParser.childBoolean(root, 'c', true)).toBe(false);
    });
});
