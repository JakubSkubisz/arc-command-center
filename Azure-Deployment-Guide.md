# Deploying the Intune Chatbot on Azure Cloud

## Full Architecture for Team 2

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      AZURE CLOUD                        │
│                                                         │
│  ┌──────────────────┐      ┌─────────────────────────┐  │
│  │  Azure Static     │      │  Azure App Service      │  │
│  │  Web Apps         │ ───▶ │  (Node.js Backend)      │  │
│  │                   │      │                         │  │
│  │  React Chatbot    │      │  /api/devices           │  │
│  │  Frontend         │      │  /api/apps/deploy       │  │
│  │                   │      │  /api/updates/push      │  │
│  └──────────────────┘      │  /api/compliance        │  │
│                             └────────┬────────────────┘  │
│                                      │                   │
│                     ┌────────────────┼────────────────┐  │
│                     │                │                │  │
│              ┌──────▼──────┐  ┌──────▼──────┐        │  │
│              │ Azure Key   │  │ Managed     │        │  │
│              │ Vault       │  │ Identity    │        │  │
│              │             │  │             │        │  │
│              │ Client ID   │  │ Auto-auth   │        │  │
│              │ Client      │  │ to Graph &  │        │  │
│              │ Secret      │  │ Key Vault   │        │  │
│              │ Tenant ID   │  └─────────────┘        │  │
│              └─────────────┘                         │  │
│                                                      │  │
└──────────────────────────────────────────────────────┘  │
                         │                                 │
                         ▼                                 │
              ┌─────────────────────┐                      │
              │  Microsoft Graph    │ ◀────────────────────┘
              │  API                │
              │                     │
              │  graph.microsoft    │
              │  .com/v1.0/         │
              │  deviceManagement/  │
              └─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Microsoft Intune   │
              │  Tenant             │
              │                     │
              │  ivystravelers      │
              │  .onmicrosoft.com   │
              └─────────────────────┘
```

**Azure services used:**

| Service | Role | Cost Tier |
|---|---|---|
| Azure Static Web Apps | Hosts the React chatbot frontend | Free |
| Azure App Service | Hosts the Node.js API backend | Free (F1) or Basic (B1) |
| Azure Key Vault | Stores client secret, tenant ID, client ID | Free tier included |
| Managed Identity | Passwordless auth between App Service ↔ Key Vault | Free |
| Entra ID App Registration | Authenticates to Microsoft Graph | Free |

---

## Step 1: Create the Azure Resources

### Prerequisites

- Azure CLI installed (`az --version`)
- An Azure subscription (free tier works for development)
- Node.js 20+ installed locally

### 1A. Login and Set Variables

```bash
# Login to Azure
az login

# Set your variables
RESOURCE_GROUP="intune-chatbot-rg"
LOCATION="eastus"
APP_NAME="intune-command-center"
KEYVAULT_NAME="intune-chatbot-kv"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION
```

### 1B. Create the App Service (Backend API)

```bash
# Create App Service Plan (Free tier)
az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group $RESOURCE_GROUP \
  --sku F1 \
  --is-linux

# Create the Web App
az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:20-lts"
```

Your backend will be available at: `https://intune-command-center.azurewebsites.net`

### 1C. Enable Managed Identity

This gives your App Service an automatic identity — no passwords needed to access Key Vault.

```bash
az webapp identity assign \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP
```

Note the `principalId` from the output. You'll need it for Key Vault access.

### 1D. Create Azure Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name $KEYVAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Grant the App Service's managed identity access to read secrets
PRINCIPAL_ID=$(az webapp identity show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $PRINCIPAL_ID \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEYVAULT_NAME"
```

### 1E. Store Your Secrets in Key Vault

After you register your Entra ID app (Step 2 from the previous guide), store the credentials:

```bash
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name "INTUNE-CLIENT-ID" \
  --value "<your-client-id>"

az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name "INTUNE-TENANT-ID" \
  --value "<your-tenant-id>"

az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name "INTUNE-CLIENT-SECRET" \
  --value "<your-client-secret>"
```

### 1F. Link Key Vault Secrets to App Service Settings

This is the magic — your app reads environment variables, but the values are pulled live from Key Vault:

```bash
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    CLIENT_ID="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=INTUNE-CLIENT-ID)" \
    TENANT_ID="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=INTUNE-TENANT-ID)" \
    CLIENT_SECRET="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=INTUNE-CLIENT-SECRET)"
```

Your Node.js code just reads `process.env.CLIENT_ID` — Azure resolves the Key Vault reference automatically.

---

## Step 2: Build the Backend API

Create this project structure locally:

```
intune-chatbot-api/
├── package.json
├── server.js
├── routes/
│   ├── devices.js
│   ├── apps.js
│   ├── updates.js
│   ├── compliance.js
│   └── config.js
├── lib/
│   └── graph.js
└── .env              (local dev only, never deploy this)
```

### package.json

```json
{
  "name": "intune-command-center-api",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "@azure/msal-node": "^2.16.0",
    "express": "^4.21.0",
    "cors": "^2.8.5"
  }
}
```

### lib/graph.js — Microsoft Graph Client

```javascript
const msal = require("@azure/msal-node");

// These come from Key Vault via App Settings (or .env locally)
const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET,
  },
};

const cca = new msal.ConfidentialClientApplication(msalConfig);
let tokenCache = { token: null, expiry: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiry) {
    return tokenCache.token;
  }
  const result = await cca.acquireTokenByClientCredential({
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
```

### server.js — Express App

```javascript
const express = require("express");
const cors = require("cors");

const devicesRouter = require("./routes/devices");
const appsRouter = require("./routes/apps");
const updatesRouter = require("./routes/updates");
const complianceRouter = require("./routes/compliance");
const configRouter = require("./routes/config");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Intune Command Center" });
});

// Route handlers
app.use("/api/devices", devicesRouter);
app.use("/api/apps", appsRouter);
app.use("/api/updates", updatesRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/config", configRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Intune Command Center API running on port ${PORT}`);
});
```

### routes/devices.js — Device Management

```javascript
const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/devices — List all managed devices
router.get("/", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceManagement/managedDevices?$select=id,deviceName,userDisplayName,operatingSystem,osVersion,complianceState,lastSyncDateTime,model,serialNumber,managedDeviceOwnerType"
    );
    res.json(
      data.value.map((d) => ({
        id: d.id,
        name: d.deviceName,
        user: d.userDisplayName,
        os: `${d.operatingSystem} ${d.osVersion}`,
        status: d.complianceState,
        lastSync: d.lastSyncDateTime,
        model: d.model,
        serial: d.serialNumber,
        ownership: d.managedDeviceOwnerType,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/sync — Trigger device sync
router.post("/:id/sync", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/syncDevice`
    );
    res.json({ success: true, action: "sync", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/reboot — Restart device
router.post("/:id/reboot", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/rebootNow`
    );
    res.json({ success: true, action: "reboot", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/wipe — Factory reset (destructive!)
router.post("/:id/wipe", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/wipe`,
      { keepUserData: req.body.keepUserData || false }
    );
    res.json({ success: true, action: "wipe", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/retire — Remove company data only
router.post("/:id/retire", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/retire`
    );
    res.json({ success: true, action: "retire", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### routes/apps.js — App Deployment

```javascript
const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/apps — List all apps in Intune
router.get("/", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceAppManagement/mobileApps?$select=id,displayName,publisher,createdDateTime"
    );
    res.json(data.value);
  } catch (err) {
    next(err);
  }
});

// POST /api/apps/deploy-store — Deploy a Microsoft Store (WinGet) app
router.post("/deploy-store", async (req, res, next) => {
  try {
    const { displayName, packageIdentifier, groupId } = req.body;

    // Step 1: Create the app
    const app = await graphRequest(
      "POST",
      "/deviceAppManagement/mobileApps",
      {
        "@odata.type": "#microsoft.graph.winGetApp",
        displayName,
        description: `Deployed via Intune Command Center`,
        publisher: "Team 2 IT",
        packageIdentifier,
        installExperience: { runAsAccount: "system" },
      },
      true // uses /beta endpoint
    );

    // Step 2: Assign to group
    await graphRequest(
      "POST",
      `/deviceAppManagement/mobileApps/${app.id}/assignments`,
      {
        mobileAppAssignments: [
          {
            "@odata.type": "#microsoft.graph.mobileAppAssignment",
            intent: "required",
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, appId: app.id, displayName });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/:id/status — Check app install status
router.get("/:id/status", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      `/deviceAppManagement/mobileApps/${req.params.id}/deviceStatuses`,
      null,
      true
    );
    res.json(data.value);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### routes/updates.js — Windows Update Management

```javascript
const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// POST /api/updates/quality — Push quality (security) update
router.post("/quality", async (req, res, next) => {
  try {
    const { displayName, groupId, releaseDate, daysUntilReboot } = req.body;

    const profile = await graphRequest(
      "POST",
      "/deviceManagement/windowsQualityUpdateProfiles",
      {
        "@odata.type": "#microsoft.graph.windowsQualityUpdateProfile",
        displayName: displayName || "Security Update - Command Center",
        description: "Pushed via Intune Command Center",
        expeditedUpdateSettings: {
          qualityUpdateRelease: releaseDate,
          daysUntilForcedReboot: daysUntilReboot || 2,
        },
      },
      true
    );

    await graphRequest(
      "POST",
      `/deviceManagement/windowsQualityUpdateProfiles/${profile.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, profileId: profile.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/updates/feature — Push feature update
router.post("/feature", async (req, res, next) => {
  try {
    const { displayName, groupId, featureUpdateVersion } = req.body;

    const profile = await graphRequest(
      "POST",
      "/deviceManagement/windowsFeatureUpdateProfiles",
      {
        "@odata.type": "#microsoft.graph.windowsFeatureUpdateProfile",
        displayName: displayName || "Feature Update - Command Center",
        description: "Pushed via Intune Command Center",
        featureUpdateVersion: featureUpdateVersion || "Windows 11, version 24H2",
      },
      true
    );

    await graphRequest(
      "POST",
      `/deviceManagement/windowsFeatureUpdateProfiles/${profile.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, profileId: profile.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/updates/ring — Create Windows Update for Business ring
router.post("/ring", async (req, res, next) => {
  try {
    const { displayName, groupId, qualityDeferral, featureDeferral } = req.body;

    const ring = await graphRequest(
      "POST",
      "/deviceManagement/deviceConfigurations",
      {
        "@odata.type":
          "#microsoft.graph.windowsUpdateForBusinessConfiguration",
        displayName: displayName || "Update Ring - Command Center",
        qualityUpdatesDeferralPeriodInDays: qualityDeferral || 0,
        featureUpdatesDeferralPeriodInDays: featureDeferral || 0,
        automaticUpdateMode: "autoInstallAtMaintenanceTime",
        businessReadyUpdatesOnly: "all",
      }
    );

    await graphRequest(
      "POST",
      `/deviceManagement/deviceConfigurations/${ring.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      }
    );

    res.json({ success: true, ringId: ring.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### routes/compliance.js — Compliance Reporting

```javascript
const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/compliance — Compliance summary
router.get("/", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceManagement/managedDevices?$select=deviceName,complianceState,userDisplayName,lastSyncDateTime,operatingSystem,osVersion"
    );

    const summary = { compliant: 0, noncompliant: 0, inGracePeriod: 0 };
    const devices = data.value.map((d) => {
      if (d.complianceState === "compliant") summary.compliant++;
      else if (d.complianceState === "noncompliant") summary.noncompliant++;
      else if (d.complianceState === "inGracePeriod") summary.inGracePeriod++;
      return d;
    });

    res.json({ summary, devices });
  } catch (err) {
    next(err);
  }
});

// GET /api/compliance/policies — List compliance policies
router.get("/policies", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceManagement/deviceCompliancePolicies"
    );
    res.json(data.value);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### routes/config.js — Configuration Profiles & Groups

```javascript
const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/config/groups — List Entra ID groups for targeting
router.get("/groups", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/groups?$select=id,displayName&$top=50"
    );
    res.json(data.value.map((g) => ({ id: g.id, name: g.displayName })));
  } catch (err) {
    next(err);
  }
});

// POST /api/config/profile — Create a configuration profile
router.post("/profile", async (req, res, next) => {
  try {
    const { displayName, settings, groupId } = req.body;

    const profile = await graphRequest(
      "POST",
      "/deviceManagement/configurationPolicies",
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationPolicy",
        name: displayName,
        description: "Created via Intune Command Center",
        platforms: "windows10",
        technologies: "mdm",
        settings,
      },
      true
    );

    await graphRequest(
      "POST",
      `/deviceManagement/configurationPolicies/${profile.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, profileId: profile.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

---

## Step 3: Deploy the Backend to Azure

### 3A. Deploy via Azure CLI (fastest)

From your `intune-chatbot-api/` directory:

```bash
# Initialize git if not already
git init
git add .
git commit -m "Initial Intune Command Center API"

# Deploy directly to Azure App Service
az webapp up \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --runtime "NODE:20-lts"
```

### 3B. Set the Node.js startup command

```bash
az webapp config set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --startup-file "node server.js"
```

### 3C. Verify deployment

```bash
curl https://intune-command-center.azurewebsites.net/api/health
# Should return: {"status":"ok","service":"Intune Command Center"}

curl https://intune-command-center.azurewebsites.net/api/devices
# Should return your real Intune device list
```

---

## Step 4: Deploy the Frontend to Azure Static Web Apps

### 4A. Update the chatbot to call your real backend

In the React chatbot, replace simulated responses with `fetch` calls. Add this constant at the top:

```javascript
const API_BASE = "https://intune-command-center.azurewebsites.net/api";
```

Then update the `processMessage` function. For example, replace the device listing case:

```javascript
case "devices": {
  const response = await fetch(`${API_BASE}/devices`);
  const devices = await response.json();
  addBotMessage(
    `Found ${devices.length} enrolled devices:`,
    <DeviceTable devices={devices} />
  );
  break;
}
```

### 4B. Create the Static Web App

```bash
# From your frontend directory (with the built React app)
npm run build

az staticwebapp create \
  --name "intune-chatbot-frontend" \
  --resource-group $RESOURCE_GROUP \
  --source "." \
  --app-build-command "npm run build" \
  --output-location "dist"
```

Or connect it directly to your GitHub repo for automatic CI/CD deployment on every push.

### 4C. Set the CORS origin on the backend

```bash
az webapp cors add \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --allowed-origins "https://intune-chatbot-frontend.azurestaticapps.net"
```

---

## Step 5: Add User Authentication (Entra ID SSO)

So that only authorized Team 2 employees can use the chatbot:

### 5A. Enable App Service Authentication

```bash
az webapp auth update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --enabled true \
  --action LoginWithAzureActiveDirectory \
  --aad-client-id "<your-client-id>" \
  --aad-tenant-id "<your-tenant-id>"
```

### 5B. Role-Based Access in Your API

Add middleware to check the user's Intune role before allowing destructive actions:

```javascript
// middleware/auth.js
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const userRoles = req.headers["x-ms-client-principal-idp"]
      ? JSON.parse(
          Buffer.from(
            req.headers["x-ms-client-principal"], "base64"
          ).toString()
        ).claims.filter((c) => c.typ === "roles").map((c) => c.val)
      : [];

    if (allowedRoles.some((role) => userRoles.includes(role))) {
      next();
    } else {
      res.status(403).json({ error: "Insufficient permissions" });
    }
  };
}

// Usage: Protect destructive endpoints
router.post("/:id/wipe", requireRole(["intune-admin"]), async (req, res, next) => {
  // ... wipe logic
});
```

---

## Security Checklist

Before going to production, verify every item:

- [ ] Client secret is in Key Vault, NOT in code or environment variables directly
- [ ] Managed Identity is enabled and linked to Key Vault
- [ ] CORS is restricted to your frontend domain only
- [ ] App Service Authentication is enabled (Entra ID SSO)
- [ ] Destructive actions (wipe, retire) require elevated roles
- [ ] All API routes have error handling and input validation
- [ ] Key Vault secret rotation is scheduled (< 12 months)
- [ ] HTTPS-only is enforced on App Service
- [ ] Diagnostic logging is enabled for audit trail

Enable HTTPS-only:
```bash
az webapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --https-only true
```

Enable diagnostic logging:
```bash
az webapp log config \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --application-logging filesystem \
  --level information
```

---

## Estimated Monthly Cost

| Service | Tier | Estimated Cost |
|---|---|---|
| Azure Static Web Apps | Free | $0 |
| Azure App Service | Free (F1) | $0 |
| Azure App Service | Basic (B1) — if you need always-on | ~$13/month |
| Azure Key Vault | Standard | ~$0.03/10,000 operations |
| Entra ID | Included with M365 | $0 |
| **Total (dev/test)** | | **$0** |
| **Total (production)** | | **~$13/month** |

---

## Quick Reference: Full Deployment Commands

```bash
# 1. Create everything
az group create --name intune-chatbot-rg --location eastus
az appservice plan create --name intune-plan --resource-group intune-chatbot-rg --sku F1 --is-linux
az webapp create --name intune-command-center --resource-group intune-chatbot-rg --plan intune-plan --runtime "NODE:20-lts"
az webapp identity assign --name intune-command-center --resource-group intune-chatbot-rg
az keyvault create --name intune-chatbot-kv --resource-group intune-chatbot-rg --location eastus

# 2. Store secrets
az keyvault secret set --vault-name intune-chatbot-kv --name "INTUNE-CLIENT-ID" --value "<id>"
az keyvault secret set --vault-name intune-chatbot-kv --name "INTUNE-TENANT-ID" --value "<id>"
az keyvault secret set --vault-name intune-chatbot-kv --name "INTUNE-CLIENT-SECRET" --value "<secret>"

# 3. Link secrets to app settings
az webapp config appsettings set --name intune-command-center --resource-group intune-chatbot-rg \
  --settings CLIENT_ID="@Microsoft.KeyVault(VaultName=intune-chatbot-kv;SecretName=INTUNE-CLIENT-ID)" \
             TENANT_ID="@Microsoft.KeyVault(VaultName=intune-chatbot-kv;SecretName=INTUNE-TENANT-ID)" \
             CLIENT_SECRET="@Microsoft.KeyVault(VaultName=intune-chatbot-kv;SecretName=INTUNE-CLIENT-SECRET)"

# 4. Deploy code
az webapp up --name intune-command-center --resource-group intune-chatbot-rg --runtime "NODE:20-lts"

# 5. Lock it down
az webapp update --name intune-command-center --resource-group intune-chatbot-rg --https-only true
az webapp cors add --name intune-command-center --resource-group intune-chatbot-rg --allowed-origins "https://your-frontend.azurestaticapps.net"
```
