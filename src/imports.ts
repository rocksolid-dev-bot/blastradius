import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import ts from "typescript";

const BUILTINS = new Set(builtinModules);

/**
 * One `import`/`require`/dynamic-`import()` found in a source file, already
 * resolved to a bare package name. Relative specifiers (`./x`, `../x`) and
 * Node builtins (`fs`, `node:fs`, `path/posix`, ...) never produce a record
 * — there is nothing for the usage map to rank.
 */
export interface ImportRecord {
  file: string;
  specifier: string;
  package: string;
  /** Named symbols imported (original/imported name, not the local alias). */
  namedSymbols: string[];
  defaultImport: boolean;
  namespaceImport: boolean;
  /**
   * True only for a whole-declaration `import type { ... } from "pkg"`.
   * Per-specifier type-only markers (`import { type X, y } from "pkg"`) are
   * not distinguished from a normal named import yet — the declaration as a
   * whole still imports a runtime value (`y`), so it is not type-only.
   */
  typeOnly: boolean;
  kind: "esm" | "cjs" | "dynamic-import";
}

/** A dynamic `import()` whose argument isn't a string literal — can't be resolved statically. */
export interface SkippedImport {
  file: string;
  reason: string;
}

/** Resolves a module specifier to a bare package name, or null if it isn't one (relative path, Node builtin). */
export function resolvePackageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("node:")) return null;
  const firstSegment = specifier.split("/")[0] ?? specifier;
  if (BUILTINS.has(firstSegment) || BUILTINS.has(specifier)) return null;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return firstSegment;
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function namedImportSymbols(clause: ts.ImportClause | undefined): {
  namedSymbols: string[];
  namespaceImport: boolean;
} {
  const bindings = clause?.namedBindings;
  if (!bindings) return { namedSymbols: [], namespaceImport: false };
  if (ts.isNamespaceImport(bindings)) return { namedSymbols: [], namespaceImport: true };
  const namedSymbols = bindings.elements.map((el) => (el.propertyName ?? el.name).text);
  return { namedSymbols, namespaceImport: false };
}

/**
 * Parses one source file and extracts every static `import`, CJS
 * `require("pkg")`, and literal dynamic `import("pkg")` — resolved to bare
 * package names. Non-literal dynamic imports are reported separately in
 * `skipped` rather than guessed at.
 */
export function extractImports(file: string): { imports: ImportRecord[]; skipped: SkippedImport[] } {
  const text = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));

  const imports: ImportRecord[] = [];
  const skipped: SkippedImport[] = [];

  function addRecord(specifier: string, kind: ImportRecord["kind"], partial: Partial<ImportRecord> = {}): void {
    const pkg = resolvePackageName(specifier);
    if (!pkg) return;
    imports.push({
      file,
      specifier,
      package: pkg,
      namedSymbols: partial.namedSymbols ?? [],
      defaultImport: partial.defaultImport ?? false,
      namespaceImport: partial.namespaceImport ?? false,
      typeOnly: partial.typeOnly ?? false,
      kind,
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const { namedSymbols, namespaceImport } = namedImportSymbols(clause);
      addRecord(node.moduleSpecifier.text, "esm", {
        namedSymbols,
        namespaceImport,
        defaultImport: Boolean(clause?.name),
        typeOnly: clause?.isTypeOnly ?? false,
      });
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        addRecord(arg.text, "cjs");
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        addRecord(arg.text, "dynamic-import");
      } else {
        skipped.push({ file, reason: "dynamic import() with non-literal argument" });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { imports, skipped };
}
