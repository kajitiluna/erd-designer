import process from 'node:process';

import CommandRunner from "~/cli/command-runner";

const USAGE = `\
erd-cli : Verify that a designed .erd schema matches a live database or another .erd revision.

USAGE:
${CommandRunner.usages().join("\n")}\
`;

const main = async (): Promise<number> => {
    const argv = process.argv.slice(2);
    const command = argv[0];

    if ((command == null) || (command === "help") || (command === "--help")) {
        console.log(USAGE);
        return 0;
    }

    const schemaCommand = CommandRunner.find(command);
    if (schemaCommand == null) {
        console.error(`Unknown command: ${command}\n`);
        console.error(USAGE);
        return 2;
    }

    const result = await CommandRunner.execute(schemaCommand, argv.slice(1));
    return CommandRunner.toExitCode(result);
};

main().then(exitCode => {
    process.exitCode = exitCode;
}).catch((error: unknown) => {
    const detail = (error instanceof Error) ? error.message : String(error);
    console.error(`Error: ${detail}`);
    process.exitCode = 2;
});
