#!/usr/bin/env node
/**
 * Cross-platform parity check for VirtualTutor.
 * Run identically on Windows/Linux/macOS: node scripts/verify-parity.mjs
 *
 * Catches the class of bug that works on Windows/macOS (case-insensitive FS)
 * but breaks on Linux/CI (case-sensitive FS): an import specifier whose case
 * doesn't exactly match the file on disk.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ALIAS_MAP = {
  "@domain": "src/domain",
  "@services": "src/services",
  "@algorithms": "src/algorithms",
  "@db": "src/db",
};

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function checkCaseSensitivity() {
  const importRe =
    /from\s+["']((?:@domain|@services|@algorithms|@db)\/[^"']+)["']/g;
  const problems = [];

  for (const file of walk("src")) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRe.exec(content))) {
      const [alias, ...rest] = match[1].split("/");
      const base = ALIAS_MAP[alias];
      if (!base) continue;
      const relPath = rest.join("/");
      const candidateBase = path.join(base, relPath);

      let resolved = null;
      for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
        if (fs.existsSync(candidateBase + ext)) {
          resolved = candidateBase + ext;
          break;
        }
      }

      if (!resolved) {
        problems.push(`UNRESOLVED  ${file} -> ${match[1]}`);
        continue;
      }

      const dir = path.dirname(resolved);
      const expectedName = path.basename(resolved);
      const actualNames = fs.readdirSync(dir);
      if (!actualNames.includes(expectedName)) {
        problems.push(
          `CASE MISMATCH  ${file} -> "${match[1]}" resolves case-insensitively ` +
            `but no exact match for "${expectedName}" in ${dir}`,
        );
      }
    }
  }
  return problems;
}

function checkLineEndings() {
  const problems = [];
  const targets = [".env", ...walk("src")];
  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    if (buf.includes(0x0d)) problems.push(`CRLF FOUND  ${file}`);
  }
  return problems;
}

function checkToolchain() {
  const results = [];
  for (const cmd of ["npx tsc --noEmit", "npx tsx --version"]) {
    try {
      execSync(cmd, { stdio: "pipe" });
      results.push(`OK    ${cmd}`);
    } catch (err) {
      results.push(`FAIL  ${cmd}\n${err.stdout?.toString() ?? err.message}`);
    }
  }
  return results;
}

console.log("== Case sensitivity (alias imports vs on-disk filenames) ==");
const caseProblems = checkCaseSensitivity();
console.log(caseProblems.length ? caseProblems.join("\n") : "OK - none found");

console.log("\n== Line endings (.env + src/**) ==");
const eolProblems = checkLineEndings();
console.log(eolProblems.length ? eolProblems.join("\n") : "OK - all LF");

console.log("\n== Toolchain ==");
console.log(checkToolchain().join("\n"));

const failed = caseProblems.length > 0 || eolProblems.length > 0;
process.exit(failed ? 1 : 0);
