import fs from "node:fs";
import path from "node:path";
import { setSnapshotReader } from "./snapshotStore";

let cache: unknown = null;
let cacheMtime = 0;

setSnapshotReader(() => {
  const file = path.join(process.cwd(), "data", "snapshot.json");
  const mtime = fs.statSync(file).mtimeMs;
  if (cache && cacheMtime === mtime) return cache as never;
  cache = JSON.parse(fs.readFileSync(file, "utf8"));
  cacheMtime = mtime;
  return cache as never;
});
