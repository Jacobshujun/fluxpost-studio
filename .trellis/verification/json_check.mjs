import fs from "node:fs";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node .trellis/verification/json_check.mjs <file...>");
  process.exitCode = 1;
} else {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing JSON file: ${file}`);
    }
    JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`JSON ok: ${file}`);
  }
}
