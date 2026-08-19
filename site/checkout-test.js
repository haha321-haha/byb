const button = document.querySelector("[data-test-checkout]");
const status = document.querySelector("[data-checkout-status]");

button?.addEventListener("click", async () => {
  const checkoutWindow = window.open("about:blank", "_blank");
  if (checkoutWindow) checkoutWindow.opener = null;
  button.disabled = true;
  button.textContent = "Preparing checkout…";
  status.textContent = "You'll be redirected to secure checkout.";

  try {
    const response = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok || (result.mode !== "test" && result.mode !== "prod") || !result.checkoutUrl) {
      throw new Error(result.error || "Checkout unavailable");
    }
    if (checkoutWindow) checkoutWindow.location.replace(result.checkoutUrl);
    else window.location.assign(result.checkoutUrl);
    status.textContent = "Checkout opened in a new tab.";
  } catch (error) {
    if (checkoutWindow) checkoutWindow.close();
    status.textContent = error.message || "Checkout unavailable.";
  } finally {
    button.disabled = false;
    button.textContent = "Get your decision — $19";
  }
});
