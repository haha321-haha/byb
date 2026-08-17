import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { handleWaffoWebhook } from "../api/waffo-webhook.mjs";

function request({ method = "POST", signature = "t=1,v1=test", body = "{}" } = {}) {
  const req = Readable.from([body]);
  req.method = method;
  req.headers = signature ? { "x-waffo-signature": signature } : {};
  return req;
}

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

const validEvent = {
  id: "EVT_test_001",
  eventType: "order.completed",
  storeId: "STO_27y76CY0tN6xZYUgt6J3YL",
  mode: "test",
};

test("rejects missing signature", async () => {
  const res = response();
  await handleWaffoWebhook({ req: request({ signature: "" }), res, verify: () => validEvent });
  assert.equal(res.statusCode, 401);
});

test("rejects an invalid signature", async () => {
  const res = response();
  await handleWaffoWebhook({ req: request(), res, verify: () => { throw new Error("invalid"); } });
  assert.equal(res.statusCode, 401);
});

test("rejects production events on the Test Mode endpoint", async () => {
  const res = response();
  await handleWaffoWebhook({ req: request(), res, verify: () => ({ ...validEvent, mode: "prod" }) });
  assert.equal(res.statusCode, 400);
});

test("rejects events for another store", async () => {
  const res = response();
  await handleWaffoWebhook({ req: request(), res, verify: () => ({ ...validEvent, storeId: "STO_other" }) });
  assert.equal(res.statusCode, 400);
});

test("accepts a verified Test Mode event for the reviewed store", async () => {
  const res = response();
  await handleWaffoWebhook({ req: request(), res, verify: () => validEvent });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "OK");
});
