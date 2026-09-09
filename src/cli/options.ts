const OPTION_PREFIX = "--";

/**
 * オプションの受け取り方。「値を取るか」「複数指定できるか」を別々の boolean に分解すると
 * 意味の無い組合せ(値を取らないのに繰り返し可、など)が表現できてしまうため1つの union で表す。
 */
type OptionArity = "single" | "repeatable" | "flag";

export type OptionSpec = {
    name: string;
    arity: OptionArity;
};

export type CommandOptions = {
    /** arity "single"。重複指定は最後の値が勝つ。未指定は null。 */
    findValue: (optionName: string) => string | null;
    /** arity "repeatable"。未指定は空配列。 */
    listValues: (optionName: string) => readonly string[];
    /** arity "flag"。--no-index のような否定フラグもここで受ける。 */
    hasFlag: (optionName: string) => boolean;
    /** オプションとして解釈されなかった位置引数。`--` 以降も含む。 */
    operands: readonly string[];
};

/** 解析結果。成功と失敗を1つの union で表し、null と message の両持ちを作らない。 */
type OptionParseResult =
    { resultType: "parsed", options: CommandOptions }
    | { resultType: "invalid", message: string };

/**
 * `--name value` / `--name=value` / 繰り返し指定 / 真偽フラグを解析する。
 * 仕様に無いオプションは黙って捨てず失敗させる。綴り違いを実行結果から推測させないため。
 */
export const parseOptions = (argv: readonly string[], specs: readonly OptionSpec[]): OptionParseResult => {
    const specMap = new Map(specs.map(spec => [spec.name, spec]));
    const collected = collectTokens(argv, specMap);
    if (collected.resultType === "invalid") {
        return { resultType: "invalid", message: collected.message };
    }

    const options = initCommandOptions(collected.values, collected.flags, collected.operands);

    return { resultType: "parsed", options };
};

type CollectResult =
    { resultType: "collected", values: Map<string, string[]>, flags: Set<string>, operands: string[] }
    | { resultType: "invalid", message: string };

// "--name" の次のトークンを値として消費するかどうかで走査位置の進め幅が変わるため、
// map/filter では表現できない。ここだけ索引走査で書く(coding-style ルール5の例外)。
const collectTokens = (argv: readonly string[], specMap: Map<string, OptionSpec>): CollectResult => {
    const values = new Map<string, string[]>();
    const flags = new Set<string>();
    const operands: string[] = [];

    let index = 0;
    let operandsOnly = false;
    while (index < argv.length) {
        const token = argv[index];

        if (operandsOnly || (token === "--")) {
            operandsOnly = true;
            if (token !== "--") {
                operands.push(token);
            }
            index += 1;
            continue;
        }

        if (token.startsWith(OPTION_PREFIX) === false) {
            operands.push(token);
            index += 1;
            continue;
        }

        const result = collectOption(argv, index, specMap);
        if (result.resultType === "invalid") {
            return result;
        }

        if (result.resultType === "flag") {
            flags.add(result.optionName);
            index += 1;
            continue;
        }

        const collected = values.get(result.optionName) ?? [];
        collected.push(result.value);
        values.set(result.optionName, collected);
        index += result.tokenCount;
    }

    return { resultType: "collected", values, flags, operands };
};

type CollectOptionResult =
    { resultType: "value", tokenCount: number, optionName: string, value: string }
    | { resultType: "flag", optionName: string }
    | { resultType: "invalid", message: string };

const collectOption = (
    argv: readonly string[], index: number, specMap: Map<string, OptionSpec>
): CollectOptionResult => {
    const token = argv[index];
    const equalsIndex = token.indexOf("=");
    const optionName = (equalsIndex >= 0) ? token.slice(0, equalsIndex) : token;

    const spec = specMap.get(optionName);
    if (spec == null) {
        return { resultType: "invalid", message: `Unknown option: ${optionName}.` };
    }

    if (spec.arity === "flag") {
        if (equalsIndex >= 0) {
            return { resultType: "invalid", message: `Option ${optionName} does not take a value.` };
        }

        return { resultType: "flag", optionName };
    }

    const inlineValue = (equalsIndex >= 0) ? token.slice(equalsIndex + 1) : null;
    if (inlineValue != null) {
        return { resultType: "value", tokenCount: 1, optionName, value: inlineValue };
    }

    const nextValue = argv[index + 1];
    if ((nextValue == null) || nextValue.startsWith(OPTION_PREFIX)) {
        return { resultType: "invalid", message: `Option ${optionName} requires a value.` };
    }

    return { resultType: "value", tokenCount: 2, optionName, value: nextValue };
};

const initCommandOptions = (
    values: Map<string, string[]>, flags: Set<string>, operands: string[]
): CommandOptions => {
    return {
        findValue: (optionName: string) => findLastValue(values, optionName),
        listValues: (optionName: string) => values.get(optionName) ?? [],
        hasFlag: (optionName: string) => flags.has(optionName),
        operands: operands
    };
};

const findLastValue = (values: Map<string, string[]>, optionName: string): string | null => {
    const collected = values.get(optionName);
    if ((collected == null) || (collected.length === 0)) {
        return null;
    }

    return collected[collected.length - 1];
};
