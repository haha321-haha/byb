import assert from "node:assert/strict";
import test from "node:test";
import { createTestCheckout, validateConfiguration } from "../api/create-checkout.mjs";

const validEnv = {
  WAFFO_ENVIRONMENT: "test",
  WAFFO_MERCHANT_ID: "MER_4fIWy0Facbl75gjrvAnBae",
  WAFFO_STORE_ID: "STO_27y76CY0tN6xZYUgt6J3YL",
  WAFFO_PRODUCT_ID: "PROD_4HCgyZAZ1EaR1B2PXU9GKD",
  WAFFO_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nsynthetic-test-only\n-----END PRIVATE KEY-----",
  BYB_PUBLIC_BASE_URL: "https://byb-preview.example",
};

test("rejects anything except the reviewed Test Mode configuration", () => {
  assert.ok(validateConfiguration({ ...validEnv, WAFFO_ENVIRONMENT: "prod" }).length > 0);
  assert.ok(validateConfiguration({ ...validEnv, WAFFO_PRODUCT_ID: "PROD_other" }).length > 0);
  assert.ok(validateConfiguration({ ...validEnv, WAFFO_PRIVATE_KEY: "" }).length > 0);
});

test("creates one-time USD checkout without exposing the private key", async () => {
  let receivedConfig;
  let receivedPayload;
  const result = await createTestCheckout({
    env: validEnv,
    createClient: (config) => {
      receivedConfig = config;
      return {
        checkout: {
          createSession: async (payload) => {
            receivedPayload = payload;
            return {
              checkoutUrl: "https://checkout.example/test-session",
              sessionId: "cs_synthetic",
              expiresAt: "2026-08-17T12:00:00.000Z",
            };
          },
        },
      };
    },
  });

  assert.equal(receivedConfig.merchantId, validEnv.WAFFO_MERCHANT_ID);
  assert.match(receivedConfig.privateKey, /PRIVATE KEY/);
  assert.deepEqual(receivedPayload, {
    productId: validEnv.WAFFO_PRODUCT_ID,
    productType: "onetime",
    currency: "USD",
    successUrl: "https://byb-preview.example/next-steps",
    metadata: {
      purpose: "byb_validation_test",
      storeId: validEnv.WAFFO_STORE_ID,
      commercialStatus: "validation_only",
    },
    expiresInSeconds: 1800,
  });
  assert.deepEqual(result, {
    checkoutUrl: "https://checkout.example/test-session",
    sessionId: "cs_synthetic",
    expiresAt: "2026-08-17T12:00:00.000Z",
    mode: "test",
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|synthetic-test-only/);
});

test("rejects an insecure checkout URL", async () => {
  await assert.rejects(
    createTestCheckout({
      env: validEnv,
      createClient: () => ({ checkout: { createSession: async () => ({ checkoutUrl: "http://invalid" }) } }),
    }),
    /secure checkout URL/,
  );
});
