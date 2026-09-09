import { CommandOptions, OptionSpec } from "~/cli/options";

/** DB接続の振る舞い(接続確立とクエリ実行それぞれの上限)。SnapshotTarget(接続先の指定)とは別の関心。 */
export type ConnectionTimeouts = {
    connectSeconds: number;
    querySeconds: number;
};

type ConnectionTimeoutsResult =
    { resultType: "parsed", timeouts: ConnectionTimeouts }
    | { resultType: "invalid", message: string };

const DEFAULT_CONNECT_SECONDS = 10;
const DEFAULT_QUERY_SECONDS = 30;

/** db-diff / migrate-ddl が共有する、DB接続タイムアウト系オプションの解釈。erd-diff はDBに接続しないため使わない。 */
export class ConnectionTimeoutOptions {

    public static readonly OPTION_SPECS: readonly OptionSpec[] = [
        { name: "--connect-timeout", arity: "single" },
        { name: "--query-timeout", arity: "single" }
    ];

    private constructor() {
        // do nothing
    }

    public static toConnectionTimeouts(options: CommandOptions): ConnectionTimeoutsResult {
        const connectResult = toPositiveSeconds(
            options.findValue("--connect-timeout"), "--connect-timeout", DEFAULT_CONNECT_SECONDS
        );
        if (connectResult.resultType === "invalid") {
            return connectResult;
        }

        const queryResult = toPositiveSeconds(
            options.findValue("--query-timeout"), "--query-timeout", DEFAULT_QUERY_SECONDS
        );

        if (queryResult.resultType === "invalid") {
            return queryResult;
        }

        return {
            resultType: "parsed",
            timeouts: { connectSeconds: connectResult.seconds, querySeconds: queryResult.seconds }
        };
    }
}

type PositiveSecondsResult = { resultType: "parsed", seconds: number } | { resultType: "invalid", message: string };

// 数値でない値・0以下の値は parseOptions と同じ方針("仕様に無い値は黙って捨てず失敗させる")に倣いエラーにする。
const toPositiveSeconds = (rawValue: string | null, optionName: string, defaultValue: number): PositiveSecondsResult => {
    if (rawValue == null) {
        return { resultType: "parsed", seconds: defaultValue };
    }

    const parsedValue = Number(rawValue);
    if ((Number.isFinite(parsedValue) === false) || (parsedValue <= 0)) {
        const message = `Invalid ${optionName} value: ${rawValue}. Expected a positive number of seconds.`;
        return { resultType: "invalid", message };
    }

    return { resultType: "parsed", seconds: parsedValue };
};
