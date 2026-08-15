import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "public");

await mkdir(resolve(publicDir, "src"), { recursive: true });
await mkdir(resolve(publicDir, "assets", "fontawesome"), { recursive: true });
await cp(resolve(root, "index.html"), resolve(publicDir, "dashboard.html"));
await cp(resolve(root, "styles.css"), resolve(publicDir, "styles.css"));
await cp(resolve(root, "src"), resolve(publicDir, "src"), { recursive: true });
await cp(
  resolve(root, "node_modules", "@fortawesome", "fontawesome-free", "css"),
  resolve(publicDir, "assets", "fontawesome", "css"),
  { recursive: true },
);
await cp(
  resolve(root, "node_modules", "@fortawesome", "fontawesome-free", "webfonts"),
  resolve(publicDir, "assets", "fontawesome", "webfonts"),
  { recursive: true },
);
