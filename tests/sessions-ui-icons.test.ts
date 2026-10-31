import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Scan application-owned literals, not rendered DOM: course text, submissions,
// announcements and other user content are runtime expressions and stay untouched.
// Copyright/registered/trademark text is legitimate unless explicitly emoji-styled.
function hasEmoji(value: string) {
  if (/[©®™]\uFE0F/u.test(value)) return true;
  return /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[#*0-9]\uFE0F?\u20E3/u.test(
    value.replace(/[©®™]/gu, ""),
  );
}
function decodeEntities(value: string) {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
    const n =
      code[0].toLowerCase() === "x"
        ? parseInt(code.slice(1), 16)
        : Number(code);
    return n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
}
function literals(source: string, filename: string) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      found.push(decodeEntities(node.text));
    else if (ts.isJsxText(node)) found.push(decodeEntities(node.text));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}
function decodeUnicodeEscapes(value: string) {
  return value.replace(
    /\\u([\da-fA-F]{4})|\\U([\da-fA-F]{8})/g,
    (_, short: string, long: string) =>
      String.fromCodePoint(parseInt(short ?? long, 16)),
  );
}
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(root, entry.name))
      : [join(root, entry.name)],
  );
}
test("Sessions product UI literals contain no emoji icons", () => {
  const failures: string[] = [];
  for (const file of files("src/components/sessions").filter((f) =>
    /\.(tsx?|css)$/.test(f),
  )) {
    const source = readFileSync(file, "utf8");
    const values = /\.tsx?$/.test(file)
      ? literals(source, file)
      : [decodeUnicodeEscapes(source)];
    if (values.some(hasEmoji)) failures.push(file);
  }
  assert.deepEqual(
    failures,
    [],
    "Replace application-owned emoji icons with the shared Lucide Icon component",
  );
});
test("The guard catches escaped strings, JSX entities, flags and keycaps without banning academic Unicode", () => {
  const emoji = String.fromCodePoint(0x1f600);
  assert.ok(hasEmoji(emoji));
  assert.ok(hasEmoji(decodeUnicodeEscapes("\\U0001f600")));
  assert.ok(hasEmoji(decodeUnicodeEscapes("\\uD83D\\uDE00")));
  assert.ok(hasEmoji(String.fromCodePoint(0x1f1f3, 0x1f1f1)));
  assert.ok(hasEmoji("1\uFE0F\u20E3"));
  const encoded = literals(
    'const label = "\\u{1f600}"; const view = <span title="&#128512;">&#x1F600;</span>;',
    "fixture.tsx",
  );
  assert.equal(encoded.length, 3);
  assert.ok(encoded.every(hasEmoji));
  assert.equal(
    hasEmoji("© 2026 Syrka ® ™ · العربية Ελληνικά ∑ ∞ ≤ x → y"),
    false,
  );
  assert.deepEqual(
    literals(
      "const view = <p>{submission.body}{announcement.body}</p>;",
      "fixture.tsx",
    ),
    [],
  );
});
