#!/usr/bin/env python3
"""Deterministic checks for the BYB validation-only commercial bundle."""

from pathlib import Path
from html.parser import HTMLParser
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.hrefs.append(href)


def read(path: Path) -> str:
    if not path.exists():
        raise AssertionError(f"missing file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def require(text: str, fragments: list[str], label: str) -> None:
    missing = [fragment for fragment in fragments if fragment.lower() not in text.lower()]
    if missing:
        raise AssertionError(f"{label}: missing {missing}")


def main() -> int:
    index = read(SITE / "index.html")
    privacy = read(SITE / "privacy.html")
    terms = read(SITE / "terms.html")
    refund = read(SITE / "refund.html")
    next_steps = read(SITE / "next-steps.html")
    sample = read(SITE / "sample.html")
    vercel_config = json.loads(read(ROOT / "vercel.json"))
    rewrites = {
        item["source"]: item["destination"]
        for item in vercel_config.get("rewrites", [])
        if "source" in item and "destination" in item
    }

    for page in SITE.glob("*.html"):
        parser = LinkCollector()
        parser.feed(read(page))
        for href in parser.hrefs:
            if href.startswith(("mailto:", "http://", "https://", "#")):
                continue
            route = href.split("#", 1)[0].split("?", 1)[0]
            if not route:
                continue
            if route.startswith("/"):
                destination = rewrites.get(route)
                if destination is None:
                    raise AssertionError(f"{page.name}: unmapped root-relative link {href}")
                target = (ROOT / destination.lstrip("/")).resolve()
            else:
                target = (page.parent / route).resolve()
            try:
                target.relative_to(ROOT)
            except ValueError:
                raise AssertionError(f"{page.name}: local link escapes repository {href}")
            if not target.exists():
                raise AssertionError(f"{page.name}: broken local link {href}")

    for label, text in {
        "index": index,
        "privacy": privacy,
        "terms": terms,
        "refund": refund,
    }.items():
        require(text, ["19", "one clarification"], label)
        normalized = text.lower().replace("48-hour", "48 hour").replace("48 hours", "48 hour")
        if "48 hour" not in normalized:
            raise AssertionError(f"{label}: missing 48-hour delivery term")
        if "one product" not in normalized:
            raise AssertionError(f"{label}: missing one-product scope")
        if not re.search(r"one (?:concrete )?decision", normalized):
            raise AssertionError(f"{label}: missing one-decision scope")

    require(index, [
        "No subscription", "automatic renewal", "Get your decision", "Waffo Pancake",
        'href="/sample"', "checkout-test.js",
    ], "index")
    require(terms, ["payment is confirmed", "complete, usable inputs", "separate agreement"], "terms")
    require(refund, ["full refund", "two business days", "Merchant-of-Record"], "refund")
    require(privacy, ["30 days", "90 days", "AI-assisted", "Microsoft Outlook"], "privacy")
    require(next_steps, ["payment is confirmed", "tiyibaofu@outlook.com"], "next-steps")

    if re.search(r"<input[^>]*disabled|<textarea[^>]*disabled", index, re.I):
        raise AssertionError("index: found disabled form control (form must be enabled for production)")
    if "WAFFO_PRIVATE_KEY" in index or "WAFFO_MERCHANT_ID" in index:
        raise AssertionError("index: server credential name leaked into browser page")
    test_client = read(SITE / "checkout-test.js")
    require(test_client, [
        "/api/create-checkout", 'result.mode !== "test" && result.mode !== "prod"', "checkoutWindow.opener = null",
    ], "test-client")
    if "WAFFO_PRIVATE_KEY" in test_client:
        raise AssertionError("test-client: private-key reference must remain server-side")

    endpoint = read(ROOT / "api" / "create-checkout.mjs")
    require(endpoint, [
        "VALID_ENVIRONMENTS", "PRODUCT_IDS", "productType: \"onetime\"", "currency: \"USD\"",
        "client.checkout.createSession", "mode: environment", "Cache-Control", "no-store",
    ], "checkout-endpoint")
    if "priceSnapshot" in endpoint:
        raise AssertionError("checkout-endpoint: price must come from the reviewed dashboard product")

    require(sample, [
        "SAMPLE — NO CUSTOMER DATA", "GO_SMALL", "Three", "Strongest counterevidence",
        "Founder × Distribution", "Seven-day", "Toward GO", "Back to WATCH", "STOP this direction",
    ], "sample")
    require(sample, ["fictional", "does not exist", "not market research"], "sample-boundary")

    print("PASS: 6 site pages")
    print("PASS: local HTML links resolve through configured Vercel rewrites")
    print("PASS: USD 19 / 48 hours / one clarification / one product / one decision aligned")
    print("PASS: production-facing site with enabled form, finalized legal pages, and checkout flow")
    print("PASS: public sample required sections and fictional-data boundary")
    print("PASS: repository verification is self-contained and does not require internal research records")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
