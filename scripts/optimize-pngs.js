#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { statSync, readdirSync } = require("node:fs");
const path = require("node:path");

const targets = ["public"]; // public/assets/tiles is already handled by public recursion
const pngFiles = [];

const collectPngs = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // Skip missing dirs silently
    return;
  }
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPngs(full);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      pngFiles.push(full);
    }
  });
};

const run = async () => {
  const oxipng = (await import("oxipng-bin")).default;

  targets.forEach(collectPngs);

  const optimize = (file) => {
    const before = statSync(file).size;
    const args = ["-o", "6", "--strip", "all", "--zopfli", "--skip-if-larger", "--quiet", file];
    const result = spawnSync(oxipng, args, { stdio: "pipe" });
    if (result.error) {
      console.error(`Failed ${file}: ${result.error.message}`);
      return { file, before, after: before, ok: false };
    }
    const after = statSync(file).size;
    return { file, before, after, ok: true };
  };

  const results = pngFiles.map(optimize);
  const succeeded = results.filter((r) => r.ok);
  const totalBefore = succeeded.reduce((sum, r) => sum + r.before, 0);
  const totalAfter = succeeded.reduce((sum, r) => sum + r.after, 0);
  const saved = totalBefore - totalAfter;

  console.log(
    `Optimized ${succeeded.length} PNGs. Saved ${(saved / 1024).toFixed(1)} KiB (${(
      (saved / Math.max(totalBefore, 1)) *
      100
    ).toFixed(2)}%).`,
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
