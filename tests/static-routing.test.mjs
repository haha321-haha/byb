import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("homepage links to every public artifact and checkout script", async () => {
  const html = await read("site/index.html");

  for (const target of ["/sample", "/privacy", "/terms", "/refund", "/checkout-test.js"]) {
    assert.match(html, new RegExp(`(?:href|src)=["']${target.replace("/", "\\/")}["']`));
  }
});

test("public artifact pages return to the canonical homepage", async () => {
  for (const page of ["sample", "privacy", "terms", "refund", "next-steps"]) {
    const html = await read(`site/${page}.html`);
    assert.match(html, /href=["']\/["']/);
  }
});

test("Vercel rewrites expose clean and legacy public routes", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));

  assert.equal(rewrites.get("/"), "/site/index.html");
  assert.equal(rewrites.get("/checkout-test.js"), "/site/checkout-test.js");

  for (const page of ["sample", "privacy", "terms", "refund", "next-steps"]) {
    assert.equal(rewrites.get(`/${page}`), `/site/${page}.html`);
    assert.equal(rewrites.get(`/${page}.html`), `/site/${page}.html`);
  }
});

test("checkout opens synchronously and retains same-tab fallback", async () => {
  const script = await read("site/checkout-test.js");
  const popupIndex = script.indexOf('window.open("about:blank", "_blank")');
  const fetchIndex = script.indexOf("fetch(");

  assert.ok(popupIndex >= 0, "checkout should open a blank tab before awaiting the API");
  assert.ok(fetchIndex > popupIndex, "popup must open before fetch to avoid popup blocking");
  assert.match(script, /checkoutWindow\.opener\s*=\s*null/);
  assert.match(script, /window\.location\.assign\(result\.checkoutUrl\)/);
});
