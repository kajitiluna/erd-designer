import { CommandOptions, OptionSpec } from "~/cli/options";
import { DatabaseSnapshotFetcher } from "~/cli/introspect/db-driver";

type SchemaCommand = {
    readonly name: string;
    readonly usage: string;
    readonly optionSpecs: readonly OptionSpec[];
    create: (fetchSnapshot: DatabaseSnapshotFetcher) => ((options: CommandOptions) => Promise<SchemaCommandResult>);
};

export type SchemaCommandResult = "ok" | "detected" | "error";

export default SchemaCommand;