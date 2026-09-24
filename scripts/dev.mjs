import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const localSdk = join(root, "..", ".tools", "dotnet", "dotnet.exe");
const userSdk = join(process.env.USERPROFILE ?? "", ".dotnet", "dotnet.exe");
const dotnet = existsSync(localSdk) ? localSdk : existsSync(userSdk) ? userSdk : "dotnet";
let password = process.env.MSSQL_SA_PASSWORD;

if (!password) {
  try {
    password = readFileSync(join(root, ".env"), "utf8").match(/^MSSQL_SA_PASSWORD=(.+)$/m)?.[1];
  } catch {
    // A custom connection string can be supplied instead.
  }
}

const connection = process.env.ConnectionStrings__CarteraClara ?? (password
  ? `Server=127.0.0.1,14333;Database=CarteraClara;User Id=sa;Password=${password};Encrypt=False`
  : null);

if (!connection) {
  console.error("Falta la conexión. Ejecuta npm run db:setup o define ConnectionStrings__CarteraClara.");
  process.exit(1);
}

const project = join(root, "api", "CarteraClara.Api.csproj");
const environment = {
  ...process.env,
  DOTNET_CLI_HOME: process.env.DOTNET_CLI_HOME ?? join(root, "..", ".tools", "dotnet-home"),
  NUGET_PACKAGES: process.env.NUGET_PACKAGES ?? join(root, "..", ".tools", "nuget"),
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  ASPNETCORE_ENVIRONMENT: "Development",
  ConnectionStrings__CarteraClara: connection
};

const restore = spawn(dotnet, ["restore", project, "--configfile", join(root, "NuGet.Config")], {
  cwd: root,
  stdio: "inherit",
  env: environment
});
restore.on("error", (error) => {
  console.error(`No se pudo iniciar .NET: ${error.message}`);
  process.exitCode = 1;
});
restore.on("exit", (code) => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  const child = spawn(dotnet, ["run", "--no-restore", "--project", project, "--urls", "http://127.0.0.1:4173"], {
    cwd: root, stdio: "inherit", env: environment
  });
  child.on("error", (error) => {
    console.error(`No se pudo iniciar la API: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (exitCode) => { process.exitCode = exitCode ?? 1; });
});
