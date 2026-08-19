const REVIEWED_MERCHANT_ID = "MER_4fIWy0Facbl75gjrvAnBae";
const REVIEWED_STORE_ID = "STO_27y76CY0tN6xZYUgt6J3YL";
// Product IDs are environment-specific; Merchant and Store are shared.
const PRODUCT_IDS = {
  test: "PROD_4HCgyZAZ1EaR1B2PXU9GKD",
  prod: "PROD_0cVK550kF6yMVDD8FnwvcW",
};
const VALID_ENVIRONMENTS = ["test", "prod"];

function getPrivateKey(env) {
  if (env.WAFFO_PRIVATE_KEY_BASE64) {
    return Buffer.from(env.WAFFO_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }
  return env.WAFFO_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
}

// The SDK (normalizePrivateKey) accepts both PEM text ("-----BEGIN PRIVATE
// KEY----- ...") and a bare base64 key body (the Waffo dashboard hands the
// latter out in its .env snippet). Validation must accept the same formats
// or the official dashboard value is rejected before it reaches the SDK.
function looksLikePrivateKey(value) {
  const normalized = String(value ?? "").replace(/\\n/g, "\n").trim();
  if (normalized.includes("PRIVATE KEY")) return true;
  const body = normalized.replace(/\s+/g, "");
  return /^[A-Za-z0-9+/]+=*$/.test(body);
}

export function validateConfiguration(env) {
  const errors = [];
  const environment = env.WAFFO_ENVIRONMENT;
  if (!VALID_ENVIRONMENTS.includes(environment)) {
    errors.push("WAFFO_ENVIRONMENT must be test or prod");
  }
  if (env.WAFFO_MERCHANT_ID !== REVIEWED_MERCHANT_ID) {
    errors.push("WAFFO_MERCHANT_ID does not match the reviewed artifact");
  }
  if (env.WAFFO_STORE_ID !== REVIEWED_STORE_ID) {
    errors.push("WAFFO_STORE_ID does not match the reviewed artifact");
  }
  const expectedProductId = PRODUCT_IDS[environment];
  if (expectedProductId && env.WAFFO_PRODUCT_ID !== expectedProductId) {
    errors.push(`WAFFO_PRODUCT_ID does not match the reviewed ${environment} artifact`);
  }
  if (env.WAFFO_PRIVATE_KEY_BASE64) {
    // Base64 form must decode to PEM text containing the header.
    if (!getPrivateKey(env).includes("PRIVATE KEY")) {
      errors.push("WAFFO_PRIVATE_KEY_BASE64 must be the base64 of the PEM private key text");
    }
  } else if (!looksLikePrivateKey(env.WAFFO_PRIVATE_KEY)) {
    errors.push("A Waffo private key is required (PEM text or base64 key body)");
  }
  return errors;
}

export async function createCheckout({ env, createClient }) {
  const errors = validateConfiguration(env);
  if (errors.length) {
    const error = new Error("Checkout is not configured");
    error.code = "CONFIGURATION_ERROR";
    error.details = errors;
    throw error;
  }

  const environment = env.WAFFO_ENVIRONMENT;
  const client = createClient({
    merchantId: env.WAFFO_MERCHANT_ID,
    privateKey: getPrivateKey(env),
  });
  const successUrl = env.BYB_PUBLIC_BASE_URL
    ? `${env.BYB_PUBLIC_BASE_URL.replace(/\/$/, "")}/next-steps`
    : undefined;
  const session = await client.checkout.createSession({
    productId: env.WAFFO_PRODUCT_ID,
    productType: "onetime",
    currency: "USD",
    ...(successUrl ? { successUrl } : {}),
    metadata: {
      purpose: "byb_decision_aid",
      storeId: env.WAFFO_STORE_ID,
      environment,
    },
    expiresInSeconds: 1800,
  });

  if (!session?.checkoutUrl || !/^https:\/\//i.test(session.checkoutUrl)) {
    throw new Error("Waffo returned no secure checkout URL");
  }
  return {
    checkoutUrl: session.checkoutUrl,
    sessionId: session.sessionId ?? null,
    expiresAt: session.expiresAt ?? null,
    mode: environment,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { WaffoPancake } = await import("@waffo/pancake-ts");
    const result = await createCheckout({
      env: process.env,
      createClient: (config) => new WaffoPancake(config),
    });
    return res.status(200).json(result);
  } catch (error) {
    const configurationError = error?.code === "CONFIGURATION_ERROR";
    if (configurationError) {
      console.error("Waffo checkout configuration is incomplete", error?.details ?? []);
      return res.status(503).json({
        error: "Checkout is not configured yet.",
        details: error?.details ?? [],
      });
    }
    console.error("Waffo checkout creation failed");
    return res.status(502).json({
      error: "Checkout could not be created.",
    });
  }
}
