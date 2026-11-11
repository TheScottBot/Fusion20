import { maximumRangeProfileLength, parseRangeProfile } from "./range_profile_grammar.ts";
import { isWireIdentifier, maximumIdentifierLength } from "./wire_identifier.ts";

export type ChatCommand =
  | { readonly verb: "target"; readonly chain: string; readonly token: string }
  | { readonly verb: "nominate"; readonly chain: string; readonly partner: string }
  | { readonly verb: "end"; readonly chain: string }
  | { readonly verb: "range"; readonly character: string; readonly value: string }
  | { readonly verb: "roller"; readonly roll: string; readonly token: string };

export type CommandRefusal =
  | "command too long"
  | "not a command"
  | "missing verb"
  | "unknown verb"
  | "missing argument"
  | "unknown argument"
  | "repeated argument"
  | "malformed argument"
  | "invalid value";

export type CommandParsing =
  | { readonly outcome: "parsed"; readonly command: ChatCommand }
  | { readonly outcome: "refused"; readonly reason: CommandRefusal };

interface CommandArgument {
  readonly name: string;
  readonly maximumLength: number;
  readonly isValid: (value: string) => boolean;
}

function identifierArgument(name: string): CommandArgument {
  return { name, maximumLength: maximumIdentifierLength, isValid: isWireIdentifier };
}

const rangeValueArgument: CommandArgument = {
  name: "value",
  maximumLength: maximumRangeProfileLength,
  isValid: (value) => parseRangeProfile(value).outcome === "parsed",
};

const commandPrefix = "!fusion20";
const wordSeparator = " ";
const argumentSeparator = "=";

// One table, from which the parser, the encoder and the length bound all derive (datum 0.7).
const commandRows: readonly {
  readonly verb: ChatCommand["verb"];
  readonly commandArguments: readonly CommandArgument[];
}[] = [
  { verb: "target", commandArguments: [identifierArgument("chain"), identifierArgument("token")] },
  { verb: "nominate", commandArguments: [identifierArgument("chain"), identifierArgument("partner")] },
  { verb: "end", commandArguments: [identifierArgument("chain")] },
  { verb: "range", commandArguments: [identifierArgument("character"), rangeValueArgument] },
  // FD19: the poster picks which of a character's tokens made a held roll (FF91).
  { verb: "roller", commandArguments: [identifierArgument("roll"), identifierArgument("token")] },
];

export const commandVerbs: readonly ChatCommand["verb"][] = commandRows.map(({ verb }) => verb);

export const maximumCommandLength = Math.max(
  ...commandRows.map(({ verb, commandArguments }) => {
    const argumentsLength = commandArguments.reduce((totalLength, { name, maximumLength }) => {
      return totalLength + wordSeparator.length + name.length + argumentSeparator.length + maximumLength;
    }, 0);
    return commandPrefix.length + wordSeparator.length + verb.length + argumentsLength;
  }),
);

function refuse(reason: CommandRefusal): CommandParsing {
  return { outcome: "refused", reason };
}

export function parseCommand(commandText: string): CommandParsing {
  if (commandText.length > maximumCommandLength) {
    return refuse("command too long");
  }
  const [prefix, verb, ...argumentWords] = commandText.split(wordSeparator);
  if (prefix !== commandPrefix) {
    return refuse("not a command");
  }
  if (verb === undefined) {
    return refuse("missing verb");
  }
  // Found in the table, never by indexing an object with the input, so a value such as
  // __proto__ cannot reach anything.
  const commandRow = commandRows.find((candidateRow) => candidateRow.verb === verb);
  if (commandRow === undefined) {
    return refuse("unknown verb");
  }
  const readValues = new Map<string, string>();
  for (const argumentWord of argumentWords) {
    const separatorIndex = argumentWord.indexOf(argumentSeparator);
    if (separatorIndex <= 0) {
      return refuse("malformed argument");
    }
    const argumentName = argumentWord.slice(0, separatorIndex);
    const argumentValue = argumentWord.slice(separatorIndex + argumentSeparator.length);
    const commandArgument = commandRow.commandArguments.find((candidate) => candidate.name === argumentName);
    if (commandArgument === undefined) {
      return refuse("unknown argument");
    }
    if (readValues.has(argumentName)) {
      return refuse("repeated argument");
    }
    if (!commandArgument.isValid(argumentValue)) {
      return refuse("invalid value");
    }
    readValues.set(argumentName, argumentValue);
  }
  if (commandRow.commandArguments.some(({ name }) => !readValues.has(name))) {
    return refuse("missing argument");
  }
  // Every key came from the table and every required one is present, which is what the type says.
  const command = { verb: commandRow.verb, ...Object.fromEntries(readValues) } as ChatCommand;
  return { outcome: "parsed", command };
}

export function encodeCommand(command: ChatCommand): string {
  const commandRow = commandRows.find((candidateRow) => candidateRow.verb === command.verb);
  const commandFields: Readonly<Record<string, string>> = command;
  const argumentWords = (commandRow?.commandArguments ?? []).map(({ name }) => {
    return `${name}${argumentSeparator}${commandFields[name] ?? ""}`;
  });
  return [commandPrefix, command.verb, ...argumentWords].join(wordSeparator);
}
