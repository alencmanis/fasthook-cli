export type ParsedArgs = {
  command: string | null;
  flags: Record<string, string | boolean>;
  positionals: string[];
};

const FLAG_ALIASES: Record<string, string> = {
  d: "destination",
  t: "to",
  h: "help",
  q: "quiet",
  v: "verbose"
};

export function parseCliArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const [rawName, inlineValue] = token.slice(2).split("=", 2);
      const name = rawName.trim();
      if (!name) continue;
      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
      } else if (argv[index + 1] && !argv[index + 1].startsWith("-")) {
        flags[name] = argv[index + 1];
        index += 1;
      } else {
        flags[name] = true;
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const rawName = token.slice(1);
      const name = FLAG_ALIASES[rawName] ?? rawName;
      if (argv[index + 1] && !argv[index + 1].startsWith("-")) {
        flags[name] = argv[index + 1];
        index += 1;
      } else {
        flags[name] = true;
      }
      continue;
    }

    if (!command) {
      command = token;
    } else {
      positionals.push(token);
    }
  }

  return { command, flags, positionals };
}

export function getStringFlag(flags: Record<string, string | boolean>, ...names: string[]): string | null {
  for (const name of names) {
    const value = flags[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function getBooleanFlag(flags: Record<string, string | boolean>, ...names: string[]): boolean {
  return names.some((name) => flags[name] === true || flags[name] === "true");
}
