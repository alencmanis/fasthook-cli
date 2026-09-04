import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_ARTIFACTS = new Set([
  "generated/control-api.openapi.json\0contracts/control-api.openapi.json",
  "generated/control-api.schemas.json\0contracts/control-api.schemas.json",
  "src/generated/control-api-client.ts\0src/generated/control-api-client.ts",
]);

function normalized(text) { return text.replace(/\r\n/g, "\n"); }
function sha256(text) { return createHash("sha256").update(normalized(text)).digest("hex"); }
function inside(base, target) {
  const path = relative(base, target);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export async function checkControlApiContracts(options = {}) {
  const repositoryRoot = resolve(options.root ?? root);
  const snapshot = JSON.parse(await readFile(resolve(repositoryRoot, "contracts/control-api.snapshot.json"), "utf8"));
  if (snapshot.schemaVersion !== 1 || snapshot.consumer !== "cli"
    || snapshot.sourceRepository !== "alencmanis/fasthook" || typeof snapshot.catalogVersion !== "string"
    || snapshot.catalogVersion.length === 0
    || snapshot.integration !== "compiled-typed-client-no-owner-command"
    || snapshot.coverage?.status !== "partial" || snapshot.coverage?.surface !== "project-api-keys"
    || snapshot.coverage?.operations !== 8 || snapshot.coverage?.schemas !== 16) {
    throw new Error("Invalid generated Control API CLI snapshot metadata");
  }
  const targets = new Set();
  const entries = new Set();
  for (const artifact of snapshot.artifacts ?? []) {
    if (typeof artifact.target !== "string" || typeof artifact.source !== "string"
      || !/^[a-f0-9]{64}$/.test(artifact.sha256) || targets.has(artifact.target)) {
      throw new Error("Invalid generated Control API CLI artifact entry");
    }
    const entry = `${artifact.source}\0${artifact.target}`;
    if (!EXPECTED_ARTIFACTS.has(entry) || entries.has(entry)) {
      throw new Error("Unexpected generated Control API CLI artifact mapping");
    }
    entries.add(entry);
    targets.add(artifact.target);
    const target = resolve(repositoryRoot, artifact.target);
    if (!inside(repositoryRoot, target)) throw new Error(`Control API artifact escapes repository: ${artifact.target}`);
    const local = await readFile(target, "utf8");
    if (sha256(local) !== artifact.sha256) throw new Error(`Control API artifact checksum drift: ${artifact.target}`);
    if (options.backendRoot) {
      const canonicalRoot = resolve(options.backendRoot);
      const sourcePath = resolve(canonicalRoot, artifact.source);
      if (!inside(canonicalRoot, sourcePath)) throw new Error(`Control API source escapes backend: ${artifact.source}`);
      const source = await readFile(sourcePath, "utf8");
      if (normalized(local) !== normalized(source)) throw new Error(`Control API backend drift: ${artifact.target}`);
    }
  }
  if (targets.size !== EXPECTED_ARTIFACTS.size || entries.size !== EXPECTED_ARTIFACTS.size) {
    throw new Error("Expected three generated Control API CLI artifacts");
  }
  return { ok: true, consumer: "cli", artifacts: targets.size, backendCompared: Boolean(options.backendRoot) };
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) {
  const backendRoot = process.env.FASTHOOK_BACKEND_DIR?.trim();
  console.log(JSON.stringify(await checkControlApiContracts({ backendRoot: backendRoot || undefined })));
}
