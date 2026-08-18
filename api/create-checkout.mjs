const REQUIRED_IDS = {
  merchantId: "MER_4fIWy0Facbl75gjrvAnBae",
  storeId: "STO_27y76CY0tN6xZYUgt6J3YL",
  productId: "PROD_4HCgyZAZ1EaR1B2PXU9GKD",
};

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
  if (env.WAFFO_ENVIRONMENT !== "test") errors.push("WAFFO_ENVIRONMENT must be test");
  for (const [name, expected] of Object.entries(REQUIRED_IDS)) {
    const envName = `WAFFO_${name.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
    if (env[envName] !== expected) errors.push(`${envName} does not match the reviewed Test Mode artifact`);
  }
  if (env.WAFFO_PRIVATE_KEY_BASE64) {
    // Base64 form must decode to PEM text containing the header.
    if (!getPrivateKey(env).includes("PRIVATE KEY")) {
      errors.push("WAFFO_PRIVATE_KEY_BASE64 must be the base64 of the PEM private key text");
    }
  } else if (!looksLikePrivateKey(env.WAFFO_PRIVATE_KEY)) {
    errors.push("A Test Mode Waffo private key is required (PEM text or base64 key body)");
  }
  return errors;
}

export async function createTestCheckout({ env, createClient }) {
  const errors = validateConfiguration(env);
  if (errors.length) {
    const error = new Error("Test checkout is not configured");
    error.code = "CONFIGURATION_ERROR";
    error.details = errors;
    throw error;
  }

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
      purpose: "byb_validation_test",
      storeId: env.WAFFO_STORE_ID,
      commercialStatus: "validation_only",
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
    mode: "test",
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
    const result = await createTestCheckout({
      env: process.env,
      createClient: (config) => new WaffoPancake(config),
    });
    return res.status(200).json(result);
  } catch (error) {
    const configurationError = error?.code === "CONFIGURATION_ERROR";
    if (configurationError) {
      console.error("Waffo Test Mode configuration is incomplete", error?.details ?? []);
      return res.status(503).json({
        error: "Test checkout is not configured yet.",
        details: error?.details ?? [],
      });
    }
    console.error("Waffo Test Mode checkout creation failed");
    return res.status(502).json({
      error: "Test checkout could not be created.",
    });
  }
}
