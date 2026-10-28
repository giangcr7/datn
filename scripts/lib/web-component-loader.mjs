import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "lightningcss";
import ts from "typescript";

const sourceRoot = fileURLToPath(
  new URL("../../apps/web/src/", import.meta.url),
);
const require = createRequire(import.meta.url);

export function createWebLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    if (filename.endsWith(".css")) {
      const styles = transform({
        filename,
        code: Buffer.from(readFileSync(filename)),
        cssModules: true,
        errorRecovery: false,
      });
      if (styles.warnings.length)
        throw new Error("CSS warnings in " + filename);
      return {
        __esModule: true,
        default: Object.fromEntries(
          Object.entries(styles.exports).map(([key, value]) => [
            key,
            value.name,
          ]),
        ),
      };
    }
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    });
    if (compiled.diagnostics?.length)
      throw new Error("TypeScript transpilation failed in " + filename);
    const target = { exports: {} };
    cache.set(filename, target);
    new Function("require", "module", "exports", compiled.outputText)(
      (specifier) => {
        if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
        if (!specifier.startsWith("@/") && !specifier.startsWith("."))
          return require(specifier);
        let dependency = specifier.startsWith("@/")
          ? resolve(sourceRoot, specifier.slice(2))
          : resolve(dirname(filename), specifier);
        if (!extname(dependency))
          dependency = [dependency + ".tsx", dependency + ".ts"].find(
            existsSync,
          );
        if (!dependency) throw new Error("Missing module: " + specifier);
        return load(dependency);
      },
      target,
      target.exports,
    );
    return target.exports;
  }
  return (path) => load(resolve(sourceRoot, path));
}
