import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PLACEHOLDERS = {
  GD_MAP_KEY: "__GD_MAP_KEY__",
  GD_MAP_SECURITY: "__GD_MAP_SECURITY__",
};

const templatePath = resolve("public/map.example.js");
const outputPath = resolve(readOutputArgument(process.argv.slice(2)));
const values = Object.fromEntries(
  Object.keys(PLACEHOLDERS).map((name) => [name, requireEnvironmentValue(name)]),
);

let output = await readFile(templatePath, "utf8");

for (const [name, placeholder] of Object.entries(PLACEHOLDERS)) {
  const occurrences = output.split(placeholder).length - 1;

  if (occurrences !== 1) {
    throw new Error(
      `Expected ${placeholder} exactly once in ${templatePath}, found ${occurrences}`,
    );
  }

  output = output.replace(
    placeholder,
    () => escapeForDoubleQuotedJavaScript(values[name]),
  );
}

await writeFile(outputPath, output, { mode: 0o600 });
console.log(`Generated ${outputPath} from the map configuration template.`);

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function escapeForDoubleQuotedJavaScript(value) {
  return JSON.stringify(value).slice(1, -1);
}

function readOutputArgument(args) {
  if (args.length === 0) {
    return "public/map.js";
  }

  if (args.length === 2 && args[0] === "--output" && args[1]) {
    return args[1];
  }

  throw new Error("Usage: npm run prepare:map -- [--output <file>]");
}
