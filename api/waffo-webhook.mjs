const REVIEWED_STORE_ID = "STO_27y76CY0tN6xZYUgt6J3YL";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function handleWaffoWebhook({ req, res, verify }) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed");
  }

  const signature = req.headers["x-waffo-signature"];
  if (typeof signature !== "string" || !signature) {
    return res.status(401).send("Invalid signature");
  }

  try {
    const rawBody = await readRawBody(req);
    const event = verify(rawBody, signature, { environment: "test" });
    if (event?.mode !== "test") return res.status(400).send("Wrong environment");
    if (event?.storeId !== REVIEWED_STORE_ID) return res.status(400).send("Wrong store");

    // Validation-only: log non-sensitive identifiers for Founder review.
    // Fulfilment remains a separate manual, Founder-reviewed workflow.
    console.info("Waffo Test Mode webhook accepted", {
      eventId: event.id ?? event.eventId ?? null,
      eventType: event.eventType ?? null,
      storeId: event.storeId,
      mode: event.mode,
    });
    return res.status(200).send("OK");
  } catch {
    return res.status(401).send("Invalid signature");
  }
}

export default async function handler(req, res) {
  const { verifyWebhook } = await import("@waffo/pancake-ts");
  return handleWaffoWebhook({ req, res, verify: verifyWebhook });
}
