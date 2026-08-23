// ERMaster (`org.insightech.er`) が出力する `.erm` ファイル専用の XML リーダ。
// 汎用 XML パーサではなく、ERMaster の writer が実際に出力する構文 (要素の入れ子とテキストのみ、
// 属性なし・名前空間なし・CDATA なし) だけを受け付ける。DOCTYPE 宣言や実体宣言、CDATA は
// ERMaster の writer が絶対に出力しない要素であり、かつ一般的な XML パーサの脆弱性
// (実体展開 DoS、正規表現インジェクション等) の主要因でもあるため、パースせずに拒否することで
// 該当するリスクのクラスを構造的に排除する。

export type ErmElement = {
    tagName: string;
    children: readonly ErmElement[];
    text: string;
};

export class ErmParseError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "ErmParseError";
    }
}

export class ErmXmlParser {

    private constructor() { }

    public static parse(source: string): ErmElement {
        const text = stripBom(source);

        const afterProlog = skipProlog(text, 0);
        const { element, nextIndex } = parseElement(text, afterProlog);
        const afterTrailing = skipMisc(text, nextIndex);

        if (afterTrailing !== text.length) {
            throw new ErmParseError(`Unexpected trailing content after the root element at position ${afterTrailing}.`);
        }

        return element;
    }

    // 直接の子要素のみを引く。ERMaster の loader は getElementsByTagName でサブツリー全体を走査するため
    // 同名タグが複数深度に出現すると誤読するが、直接子検索に統一することでこの罠を構造的に回避する。
    public static findChild(element: ErmElement | null, tagName: string): ErmElement | null {
        if (element == null) {
            return null;
        }

        return element.children.find(child => (child.tagName === tagName)) ?? null;
    }

    public static findChildren(element: ErmElement | null, tagName: string): ErmElement[] {
        if (element == null) {
            return [];
        }

        return element.children.filter(child => (child.tagName === tagName));
    }

    public static childText(element: ErmElement | null, tagName: string): string {
        if (element == null) {
            return "";
        }

        const child = ErmXmlParser.findChild(element, tagName);
        return (child != null) ? child.text : "";
    }

    public static childInt(element: ErmElement, tagName: string, defaultValue: number): number {
        const text = ErmXmlParser.childText(element, tagName);
        if (text === "") {
            return defaultValue;
        }

        const parsed = Number.parseInt(text, 10);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    // ERMaster の Boolean.valueOf 相当: 要素が存在すれば "true" (大小無視) 以外はすべて false とみなす。
    // defaultValue が使われるのは要素そのものが存在しない場合のみ。
    public static childBoolean(element: ErmElement, tagName: string, defaultValue: boolean): boolean {
        const child = ErmXmlParser.findChild(element, tagName);
        if (child == null) {
            return defaultValue;
        }

        return child.text.toLowerCase() === "true";
    }
}

const WHITESPACE = /\s/;
const TAG_NAME_END = /[\s/>]/;

const stripBom = (source: string): string => {
    return (source.charCodeAt(0) === 0xFEFF) ? source.slice(1) : source;
};

const skipProlog = (text: string, startIndex: number): number => {
    const afterLeadingSpace = skipWhitespace(text, startIndex);

    if (text.startsWith("<?xml", afterLeadingSpace) === false) {
        return skipMisc(text, afterLeadingSpace);
    }

    const declarationEnd = text.indexOf("?>", afterLeadingSpace);
    if (declarationEnd < 0) {
        throw new ErmParseError("Unterminated XML declaration.");
    }

    return skipMisc(text, declarationEnd + 2);
};

// ルート要素の前後にある空白・コメントを読み飛ばす。DOCTYPE と処理命令は ERMaster が出力せず、
// 実体展開 DoS など汎用 XML パーサの脆弱性の主要因でもあるため、検出した時点で拒否する。
const skipMisc = (text: string, startIndex: number): number => {
    let index = skipWhitespace(text, startIndex);

    while (text.startsWith("<!--", index)) {
        index = skipComment(text, index);
        index = skipWhitespace(text, index);
    }

    if (text.startsWith("<!DOCTYPE", index) || text.startsWith("<!doctype", index)) {
        throw new ErmParseError("DOCTYPE declarations are not supported.");
    }
    if (text.startsWith("<?", index)) {
        throw new ErmParseError("Processing instructions are not supported.");
    }

    return index;
};

const skipWhitespace = (text: string, startIndex: number): number => {
    let index = startIndex;
    while ((index < text.length) && WHITESPACE.test(text[index])) {
        index++;
    }

    return index;
};

const skipComment = (text: string, startIndex: number): number => {
    const end = text.indexOf("-->", startIndex + 4);
    if (end < 0) {
        throw new ErmParseError("Unterminated comment.");
    }

    return end + 3;
};

type ParsedElement = { element: ErmElement, nextIndex: number };

const parseElement = (text: string, startIndex: number): ParsedElement => {
    if (text[startIndex] !== "<") {
        throw new ErmParseError(`Expected '<' at position ${startIndex}.`);
    }

    const { tagName, nextIndex: afterTagName } = readTagName(text, startIndex + 1);
    const afterAttributeSpace = skipWhitespace(text, afterTagName);

    if (afterAttributeSpace >= text.length) {
        throw new ErmParseError(`Unexpected end of document while parsing tag <${tagName}>.`);
    }

    if (text.startsWith("/>", afterAttributeSpace)) {
        return { element: { tagName, children: [], text: "" }, nextIndex: afterAttributeSpace + 2 };
    }

    if (text[afterAttributeSpace] !== ">") {
        throw new ErmParseError(
            `Attributes are not supported (found on <${tagName}> at position ${afterAttributeSpace}).`
        );
    }

    return parseElementContent(text, afterAttributeSpace + 1, tagName);
};

const readTagName = (text: string, startIndex: number): { tagName: string, nextIndex: number } => {
    let index = startIndex;
    while ((index < text.length) && (TAG_NAME_END.test(text[index]) === false)) {
        index++;
    }

    if (index === startIndex) {
        throw new ErmParseError(`Expected a tag name at position ${startIndex}.`);
    }

    const tagName = text.slice(startIndex, index);
    if (tagName.includes(":")) {
        throw new ErmParseError(`Namespace-prefixed tag names are not supported: <${tagName}>.`);
    }

    return { tagName, nextIndex: index };
};

const parseElementContent = (text: string, startIndex: number, tagName: string): ParsedElement => {
    const children: ErmElement[] = [];
    let textBuffer = "";
    let index = startIndex;

    while (true) {
        if (index >= text.length) {
            throw new ErmParseError(`Unexpected end of document inside <${tagName}>.`);
        }

        if (text.startsWith("</", index)) {
            return closeElement(text, index, tagName, children, textBuffer);
        }

        if (text.startsWith("<!--", index)) {
            index = skipComment(text, index);
            continue;
        }

        if (text.startsWith("<![CDATA[", index)) {
            throw new ErmParseError("CDATA sections are not supported.");
        }
        if (text.startsWith("<!", index)) {
            throw new ErmParseError("DOCTYPE / internal subset declarations are not supported.");
        }
        if (text.startsWith("<?", index)) {
            throw new ErmParseError("Processing instructions are not supported.");
        }

        if (text[index] === "<") {
            const parsed = parseElement(text, index);
            children.push(parsed.element);
            index = parsed.nextIndex;
            continue;
        }

        const nextTagStart = text.indexOf("<", index);
        if (nextTagStart < 0) {
            throw new ErmParseError(`Unexpected end of document inside <${tagName}>.`);
        }

        textBuffer += decodeText(text.slice(index, nextTagStart));
        index = nextTagStart;
    }
};

const closeElement = (
    text: string, startIndex: number, tagName: string, children: ErmElement[], textBuffer: string
): ParsedElement => {
    const closeNameEnd = text.indexOf(">", startIndex + 2);
    if (closeNameEnd < 0) {
        throw new ErmParseError(`Unterminated closing tag for <${tagName}>.`);
    }

    const closeName = text.slice(startIndex + 2, closeNameEnd).trim();
    if (closeName !== tagName) {
        throw new ErmParseError(`Mismatched closing tag: expected </${tagName}> but found </${closeName}>.`);
    }

    return {
        element: { tagName, children, text: (children.length === 0) ? textBuffer : "" },
        nextIndex: closeNameEnd + 1
    };
};

// ERMaster の writer が出力する実体参照 (&lt; &gt; &quot; &apos; &amp;) と数値文字参照のみを対象とする。
// & の直後が既知パターンに一致する場合のみエンティティとして消費し、一致しなければ & をそのまま1文字として出力する。
// 無関係な & (エスケープされていないテキスト中の & など) の後方にたまたま `;` があるだけでインポート全体を失敗させないための寛容さで、
// 既知パターンへの一致判定自体は decodeEntity と同じ範囲に絞っている。
const ENTITY_REFERENCE_PATTERN = /^&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|quot|apos|amp);/;

const decodeText = (raw: string): string => {
    let result = "";
    let index = 0;

    while (index < raw.length) {
        if (raw[index] !== "&") {
            result += raw[index];
            index++;
            continue;
        }

        const match = ENTITY_REFERENCE_PATTERN.exec(raw.slice(index));
        if (match == null) {
            result += "&";
            index++;
            continue;
        }

        result += decodeEntity(match[1]);
        index += match[0].length;
    }

    return result;
};

const decodeEntity = (entityBody: string): string => {
    if (entityBody.startsWith("#x") || entityBody.startsWith("#X")) {
        return decodeNumericEntity(entityBody.slice(2), 16, entityBody);
    }
    if (entityBody.startsWith("#")) {
        return decodeNumericEntity(entityBody.slice(1), 10, entityBody);
    }

    switch (entityBody) {
        case "lt": return "<";
        case "gt": return ">";
        case "amp": return "&";
        case "apos": return "'";
        case "quot": return '"';
        default:
            throw new ErmParseError(`Unsupported entity reference: &${entityBody};`);
    }
};

const decodeNumericEntity = (digits: string, radix: number, entityBody: string): string => {
    const codePoint = Number.parseInt(digits, radix);
    if (Number.isNaN(codePoint)) {
        throw new ErmParseError(`Invalid numeric character reference: &${entityBody};`);
    }

    return String.fromCodePoint(codePoint);
};
