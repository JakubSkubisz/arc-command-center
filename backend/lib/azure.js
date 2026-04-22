const msal = require("@azure/msal-node");

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
    scopes: ["https://management.azure.com/.default"],
  });
  tokenCache = {
    token: result.accessToken,
    expiry: Date.now() + (result.expiresOn - Date.now()) * 0.9,
  };
  return result.accessToken;
}

function getSubscriptionId() {
  const sub = process.env.AZURE_SUBSCRIPTION_ID;
  if (!sub) {
    throw new Error(
      "Missing AZURE_SUBSCRIPTION_ID environment variable."
    );
  }
  return sub;
}

function getResourceGroup() {
  return process.env.AZURE_RESOURCE_GROUP || "arc-machines";
}

/**
 * Make a request to the Azure Resource Manager API.
 * @param {string} method - HTTP method
 * @param {string} path - Full ARM path after https://management.azure.com (should start with /)
 * @param {object|null} data - Request body
 * @param {string} apiVersion - API version query param
 */
async function armRequest(method, path, data = null, apiVersion = "2024-07-10") {
  const token = await getToken();

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://management.azure.com${path}${separator}api-version=${apiVersion}`;

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (data) options.body = JSON.stringify(data);

  const response = await fetch(url, options);

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") || "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return armRequest(method, path, data, apiVersion);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `ARM API ${response.status}: ${error?.error?.message || "Unknown error"}`
    );
  }

  if (response.status === 204 || response.status === 202) return { success: true };
  return response.json();
}

/**
 * Build a resource path scoped to the configured subscription and resource group.
 */
function scopedPath(resource) {
  return `/subscriptions/${getSubscriptionId()}/resourceGroups/${getResourceGroup()}/${resource}`;
}

/**
 * Build a subscription-level path.
 */
function subPath(resource) {
  return `/subscriptions/${getSubscriptionId()}/${resource}`;
}

module.exports = { armRequest, scopedPath, subPath, getSubscriptionId, getResourceGroup };
