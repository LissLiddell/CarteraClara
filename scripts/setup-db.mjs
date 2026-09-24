import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  console.log("La contraseña local ya existe; no se cambió.");
} else {
  const password = `Cc_${randomBytes(24).toString("base64url")}9!`;
  writeFileSync(envPath, `MSSQL_SA_PASSWORD=${password}\n`, { mode: 0o600, flag: "wx" });
  console.log("Contraseña local generada en .env. No la subas a Git.");
}
