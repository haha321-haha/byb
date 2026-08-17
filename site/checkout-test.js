const button = document.querySelector("[data-test-checkout]");
const status = document.querySelector("[data-checkout-status]");

button?.addEventListener("click", async () => {
  const checkoutWindow = window.open("about:blank", "_blank");
  if (checkoutWindow) checkoutWindow.opener = null;
  button.disabled = true;
  button.textContent = "Creating Test Mode checkout…";
  status.textContent = "No real payment is being created on this page.";

  try {
    const response = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok || result.mode !== "test" || !result.checkoutUrl) {
      throw new Error(result.error || "Test checkout unavailable");
    }
    if (checkoutWindow) checkoutWindow.location.replace(result.checkoutUrl);
    else window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
    status.textContent = "Waffo Test Mode opened in a new tab. It is not revenue or a real order.";
  } catch (error) {
    if (checkoutWindow) checkoutWindow.close();
    status.textContent = error.message || "Test checkout unavailable.";
  } finally {
    button.disabled = false;
    button.textContent = "Open Waffo Test Checkout";
  }
});
