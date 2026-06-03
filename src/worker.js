const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"
]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStripeAmount(amount, currency) {
  const value = Math.max(0, safeNumber(amount, 0));
  const code = String(currency || "pkr").toLowerCase();

  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return Math.round(value);
  }

  return Math.round(value * 100);
}

function serviceSummary(order) {
  const type = order?.serviceType || order?.service_type || "";
  const table = String(order?.tableNumber || order?.table_number || "").trim();

  if (type === "dine_in") {
    return table ? `Dine In - Table ${table}` : "Dine In";
  }

  if (type === "takeaway") return "Takeaway";

  return "Not selected";
}

async function createCheckoutSession(request, env) {
  try {
    const stripeSecretKey = env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return jsonResponse({
        ok: false,
        error: "Stripe secret key is not configured."
      }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const order = body.order || {};

    if (!order.id) {
      return jsonResponse({
        ok: false,
        error: "Missing order id."
      }, 400);
    }

    const total = safeNumber(order.total, 0);
    if (total <= 0) {
      return jsonResponse({
        ok: false,
        error: "Invalid order total."
      }, 400);
    }

    const url = new URL(request.url);
    const siteUrl = env.SITE_URL || `${url.protocol}//${url.host}`;
    const currency = String(env.STRIPE_CURRENCY || order.currency || "pkr").toLowerCase();
    const stripeAmount = toStripeAmount(total, currency);

    const params = new URLSearchParams();

    params.append("mode", "payment");
    params.append("payment_method_types[0]", "card");
    params.append("client_reference_id", order.id);

    params.append("metadata[order_id]", order.id);
    params.append("metadata[restaurant_id]", order.restaurantId || "");
    params.append("metadata[service_type]", order.serviceType || "");
    params.append("metadata[table_number]", order.tableNumber || "");

    params.append("line_items[0][quantity]", "1");
    params.append("line_items[0][price_data][currency]", currency);
    params.append("line_items[0][price_data][unit_amount]", String(stripeAmount));
    params.append("line_items[0][price_data][product_data][name]", `Food Court Order ${order.id}`);
    params.append("line_items[0][price_data][product_data][description]", serviceSummary(order));

    params.append(
      "success_url",
      `${siteUrl}/kiosk.html?stripe_success=1&order_id=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`
    );

    params.append(
      "cancel_url",
      `${siteUrl}/kiosk.html?stripe_cancel=1&order_id=${encodeURIComponent(order.id)}`
    );

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    const stripeData = await stripeRes.json();

    if (!stripeRes.ok) {
      return jsonResponse({
        ok: false,
        error: stripeData?.error?.message || "Stripe Checkout Session creation failed.",
        stripeError: stripeData?.error || null
      }, 500);
    }

    return jsonResponse({
      ok: true,
      sessionId: stripeData.id,
      url: stripeData.url
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err.message || "Unexpected Stripe function error."
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/stripe/create-checkout-session" && request.method === "POST") {
      return createCheckoutSession(request, env);
    }

    // Serve your existing static website files.
    return env.ASSETS.fetch(request);
  }
};