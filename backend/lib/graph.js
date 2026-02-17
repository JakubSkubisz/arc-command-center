const msal = require("@azure/msal-node");

// Lazy-initialized — MSAL client is only created when the first Graph call is made.
// This allows the server to start without credentials (demo mode).
let cca = null;
let tokenCache = { token: null, expiry: 0 };

function getMsalClient() {
  if (cca) return cca;

  const { CLIENT_ID, TENANT_ID, CLIENT_SECRET } = process.env;
  if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Missing Azure credentials. Set CLIENT_ID, TENANT_ID, and CLIENT_SECRET environment variables."
    );
  }

  cca = new msal.ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      clientSecret: CLIENT_SECRET,
    },
  });
  return cca;
}

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiry) {
    return tokenCache.token;
  }
  const client = getMsalClient();
  const result = await client.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  tokenCache = {
    token: result.accessToken,
    expiry: Date.now() + (result.expiresOn - Date.now()) * 0.9,
  };
  return result.accessToken;
}

async function graphRequest(method, endpoint, data = null, usesBeta = false) {
  const token = await getToken();
  const base = usesBeta
    ? "https://graph.microsoft.com/beta"
    : "https://graph.microsoft.com/v1.0";

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (data) options.body = JSON.stringify(data);

  const response = await fetch(`${base}${endpoint}`, options);

  if (response.status === 429) {
    // Throttled — respect Retry-After header
    const retryAfter = parseInt(response.headers.get("Retry-After") || "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return graphRequest(method, endpoint, data, usesBeta); // retry
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Graph API ${response.status}: ${error?.error?.message || "Unknown error"}`
    );
  }

  // Some actions (sync, reboot) return 204 No Content
  if (response.status === 204) return { success: true };
  return response.json();
}

module.exports = { graphRequest };
