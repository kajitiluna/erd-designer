import { parseOptions } from "~/cli/options";
import SchemaCommand, { SchemaCommandResult } from "~/cli/commands/schema-command";
import { erdDifference } from "./commands/erd-diff";
import { dbDifference } from "./commands/db-diff";
import { ddlMigration } from "./commands/migrate-ddl";
import DbDriver from "./introspect/db-driver";

const commands: SchemaCommand[] = [erdDifference, dbDifference, ddlMigration] as const;

/** erd-cli.ts / erd-agent.ts が共有する、コマンド表の解決・実行・終了コード化の枠組み。 */
export default class CommandRunner {

    private constructor() {
        // do nothing.
    }

    public static find(commandName: string): SchemaCommand | null {
        return commands.find(command => (command.name === commandName)) ?? null;
    }

    public static usages() {
        return commands.map(command => command.usage);
    }

    /**
     * command.optionSpecs で argv を解析してから実行する。
     */
    public static async execute(command: SchemaCommand, argv: readonly string[]): Promise<SchemaCommandResult> {
        const parsedOptions = parseOptions(argv, command.optionSpecs);
        if (parsedOptions.resultType === "invalid") {
            console.error(parsedOptions.message);
            return "error";
        }

        const execute = command.create(DbDriver.fetchSnapshot)
        return execute(parsedOptions.options);
    }

    public static toExitCode(result: SchemaCommandResult): number {
        if (result === "ok") {
            return 0;
        }
        if (result === "detected") {
            return 1;
        }

        return 2;
    }
}
