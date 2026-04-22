# Connecting Your Intune Chatbot to Live Endpoints

## Microsoft Graph API Integration Guide for Team 2

---

## Overview

The chatbot you have is a UI wrapper with simulated data. To make it functional against your real Intune tenant, you need to connect it to the **Microsoft Graph API** — the single REST endpoint (`https://graph.microsoft.com`) that gives programmatic access to all Intune operations.

This guide walks through every step: registering your app in Entra ID, authenticating, and wiring up each chatbot action to the correct Graph API endpoint.

---

## Step 1: Prerequisites

Before you begin, ensure you have:

- An **active Microsoft Intune license** (included in Microsoft 365 E3/E5, or standalone)
- **Global Administrator** or **Intune Administrator** role in your tenant (`ivystravelers.onmicrosoft.com`)
- Access to the **Microsoft Entra Admin Center** (formerly Azure AD)
- A backend server (Node.js, Python, or similar) to proxy API calls — never expose client secrets in the browser

---

## Step 2: Register an App in Microsoft Entra ID

This creates the identity your chatbot uses to authenticate with Microsoft Graph.

1. Go to **[Microsoft Entra Admin Center](https://entra.microsoft.com)**
2. Navigate to **Identity → Applications → App registrations → New registration**
3. Configure:
   - **Name**: `Intune Command Center`
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: `http://localhost:3000/auth/callback` (for development)
4. Click **Register** and note down:
   - **Application (client) ID**
   - **Directory (tenant) ID**

### Create a Client Secret

1. In your app registration, go to **Certificates & secrets → Client secrets → New client secret**
2. Add a description (e.g., `chatbot-prod`) and set expiration (Microsoft recommends < 12 months)
3. **Copy the secret value immediately** — it won't be shown again

---

## Step 3: Configure API Permissions

Your app needs specific Microsoft Graph permissions. Go to **API permissions → Add a permission → Microsoft Graph → Application permissions** and add:

| Permission | Purpose |
|---|---|
| `DeviceManagementManagedDevices.ReadWrite.All` | List, sync, wipe, retire devices |
| `DeviceManagementApps.ReadWrite.All` | Deploy apps, check install status |
| `DeviceManagementConfiguration.ReadWrite.All` | Create/assign config profiles, compliance policies |
| `DeviceManagementServiceConfig.ReadWrite.All` | Manage update rings, tenant settings |
| `DeviceManagementScripts.ReadWrite.All` | PowerShell script deployment (replaced `Configuration.ReadWrite.All` for scripts as of July 2025) |
| `Directory.Read.All` | Read groups for assignment targeting |

After adding permissions, click **Grant admin consent for [your tenant]**. This is required because all Intune Graph permissions require admin-level access.

---

## Step 4: Backend Authentication

**Never call Graph API directly from the browser.** Build a backend proxy that handles authentication and forwards requests.

### Node.js Example (using MSAL)

```bash
npm install @azure/msal-node axios express
```

```javascript
// server.js
const msal = require("@azure/msal-node");
const axios = require("axios");
const express = require("express");

const app = express();
app.use(express.json());

const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,         // from Step 2
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET,  // from Step 2
  },
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getToken() {
  const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return result.accessToken;
}

async function graphRequest(method, endpoint, data = null) {
  const token = await getToken();
  const config = {
    method,
    url: `https://graph.microsoft.com/v1.0${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (data) config.data = data;
  return axios(config);
}

// Expose endpoints for the chatbot frontend
// (see Step 5 for each route)

app.listen(3001, () => console.log("Intune API proxy running on :3001"));
```

### Python Example (using MSAL)

```python
# server.py
from msal import ConfidentialClientApplication
import requests, os

app = ConfidentialClientApplication(
    client_id=os.environ["CLIENT_ID"],
    authority=f"https://login.microsoftonline.com/{os.environ['TENANT_ID']}",
    client_credential=os.environ["CLIENT_SECRET"],
)

def get_token():
    result = app.acquire_token_for_client(
        scopes=["https://graph.microsoft.com/.default"]
    )
    return result["access_token"]

def graph_request(method, endpoint, data=None):
    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"https://graph.microsoft.com/v1.0{endpoint}"
    return requests.request(method, url, headers=headers, json=data)
```

---

## Step 5: API Endpoint Mapping

Here is every chatbot action mapped to its real Graph API call. These are the routes you add to your backend proxy.

---

### 5A. List All Managed Devices (Device Status / Dashboard)

**Chatbot trigger**: "Show me all device statuses", "Show dashboard"

```
GET /deviceManagement/managedDevices
```

```javascript
// Backend route
app.get("/api/devices", async (req, res) => {
  const response = await graphRequest("GET", "/deviceManagement/managedDevices");
  const devices = response.data.value.map((d) => ({
    id: d.id,
    name: d.deviceName,
    user: d.userDisplayName,
    os: `${d.operatingSystem} ${d.osVersion}`,
    status: d.complianceState,       // "compliant", "noncompliant", "inGracePeriod"
    lastSync: d.lastSyncDateTime,
    model: d.model,
    serialNumber: d.serialNumber,
  }));
  res.json(devices);
});
```

**Key response fields**: `deviceName`, `complianceState`, `lastSyncDateTime`, `operatingSystem`, `osVersion`, `userDisplayName`, `managementState`

---

### 5B. Deploy an App (App Deployment)

**Chatbot trigger**: "Install Chrome on All Devices", "Deploy Slack to Remote Workers"

This is a two-step process: create the app, then assign it to a group.

#### Step 1: Create a Microsoft Store App

```
POST /deviceAppManagement/mobileApps
```

```javascript
app.post("/api/apps/deploy-store", async (req, res) => {
  const { displayName, packageIdentifier, description } = req.body;

  // Create the app in Intune
  const appResponse = await graphRequest(
    "POST",
    "/deviceAppManagement/mobileApps",
    {
      "@odata.type": "#microsoft.graph.winGetApp",
      displayName,                    // e.g., "Google Chrome"
      description,
      publisher: "Team 2 IT",
      packageIdentifier,              // WinGet ID, e.g., "Google.Chrome"
      installExperience: {
        runAsAccount: "system",       // "system" or "user"
      },
    }
  );

  const appId = appResponse.data.id;

  // Assign to a group
  const { groupId, intent } = req.body; // intent: "required", "available", "uninstall"
  await graphRequest(
    "POST",
    `/deviceAppManagement/mobileApps/${appId}/assignments`,
    {
      mobileAppAssignments: [
        {
          "@odata.type": "#microsoft.graph.mobileAppAssignment",
          intent,                     // "required" = auto-install
          target: {
            "@odata.type": "#microsoft.graph.groupAssignmentTarget",
            groupId,                  // Entra ID group ID
          },
        },
      ],
    }
  );

  res.json({ success: true, appId });
});
```

#### For Win32 Apps (.intunewin files)

Win32 app deployment is more complex — you need to upload the `.intunewin` package. The flow is: create the app entity → request a content upload URL → upload the encrypted file → commit. See Microsoft's [Win32 app upload documentation](https://learn.microsoft.com/en-us/graph/api/resources/intune-apps-win32lobapp).

---

### 5C. Push Windows Updates (Quality / Feature Updates)

**Chatbot trigger**: "Push latest quality update to all devices", "Push feature update"

#### Quality Updates (Expedited)

```
POST /deviceManagement/windowsQualityUpdateProfiles
```

```javascript
app.post("/api/updates/quality", async (req, res) => {
  const { displayName, groupId, releaseDate } = req.body;

  const profile = await graphRequest(
    "POST",
    "/deviceManagement/windowsQualityUpdateProfiles",
    {
      "@odata.type": "#microsoft.graph.windowsQualityUpdateProfile",
      displayName,                        // e.g., "Feb 2026 Security Update"
      description: "Deployed via Intune Command Center",
      expeditedUpdateSettings: {
        qualityUpdateRelease: releaseDate, // e.g., "2026-02-11"
        daysUntilForcedReboot: 2,
      },
    }
  );

  // Assign to group
  await graphRequest(
    "POST",
    `/deviceManagement/windowsQualityUpdateProfiles/${profile.data.id}/assignments`,
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

  res.json({ success: true, profileId: profile.data.id });
});
```

#### Feature Updates

```
POST /deviceManagement/windowsFeatureUpdateProfiles
```

```javascript
app.post("/api/updates/feature", async (req, res) => {
  const { displayName, groupId, featureUpdateVersion } = req.body;

  const profile = await graphRequest(
    "POST",
    "/deviceManagement/windowsFeatureUpdateProfiles",
    {
      "@odata.type": "#microsoft.graph.windowsFeatureUpdateProfile",
      displayName,
      description: "Deployed via Intune Command Center",
      featureUpdateVersion,              // e.g., "Windows 11, version 24H2"
    }
  );

  await graphRequest(
    "POST",
    `/deviceManagement/windowsFeatureUpdateProfiles/${profile.data.id}/assignments`,
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

  res.json({ success: true, profileId: profile.data.id });
});
```

#### Windows Update for Business (Update Rings)

```
POST /deviceManagement/deviceConfigurations
```

```javascript
app.post("/api/updates/ring", async (req, res) => {
  const { displayName, groupId, deferralDays } = req.body;

  const ring = await graphRequest(
    "POST",
    "/deviceManagement/deviceConfigurations",
    {
      "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
      displayName,
      qualityUpdatesDeferralPeriodInDays: deferralDays || 0,
      featureUpdatesDeferralPeriodInDays: deferralDays || 0,
      automaticUpdateMode: "autoInstallAtMaintenanceTime",
      businessReadyUpdatesOnly: "all",
    }
  );

  await graphRequest(
    "POST",
    `/deviceManagement/deviceConfigurations/${ring.data.id}/assignments`,
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

  res.json({ success: true, ringId: ring.data.id });
});
```

---

### 5D. Remote Device Actions (Sync, Restart, Wipe, Retire)

**Chatbot trigger**: "Sync all devices", "Restart IVY-PC-001", "Wipe device"

```javascript
// Sync a device
app.post("/api/devices/:id/sync", async (req, res) => {
  await graphRequest(
    "POST",
    `/deviceManagement/managedDevices/${req.params.id}/syncDevice`
  );
  res.json({ success: true });
});

// Restart a device
app.post("/api/devices/:id/reboot", async (req, res) => {
  await graphRequest(
    "POST",
    `/deviceManagement/managedDevices/${req.params.id}/rebootNow`
  );
  res.json({ success: true });
});

// Wipe a device (factory reset)
app.post("/api/devices/:id/wipe", async (req, res) => {
  await graphRequest(
    "POST",
    `/deviceManagement/managedDevices/${req.params.id}/wipe`,
    { keepUserData: false }
  );
  res.json({ success: true });
});

// Retire a device (remove company data only)
app.post("/api/devices/:id/retire", async (req, res) => {
  await graphRequest(
    "POST",
    `/deviceManagement/managedDevices/${req.params.id}/retire`
  );
  res.json({ success: true });
});
```

---

### 5E. Compliance Policies & Status

**Chatbot trigger**: "Show compliance status", "Check compliance"

```javascript
// Get compliance overview
app.get("/api/compliance", async (req, res) => {
  // Get all devices with compliance state
  const devices = await graphRequest(
    "GET",
    "/deviceManagement/managedDevices?$select=deviceName,complianceState,userDisplayName,lastSyncDateTime"
  );

  const summary = {
    compliant: 0,
    noncompliant: 0,
    inGracePeriod: 0,
    devices: [],
  };

  devices.data.value.forEach((d) => {
    if (d.complianceState === "compliant") summary.compliant++;
    else if (d.complianceState === "noncompliant") summary.noncompliant++;
    else if (d.complianceState === "inGracePeriod") summary.inGracePeriod++;
    summary.devices.push(d);
  });

  res.json(summary);
});

// List compliance policies
app.get("/api/compliance/policies", async (req, res) => {
  const response = await graphRequest(
    "GET",
    "/deviceManagement/deviceCompliancePolicies"
  );
  res.json(response.data.value);
});
```

---

### 5F. Configuration Profiles (Date/Time/Region, etc.)

**Chatbot trigger**: "Configure date time region", "Create configuration profile"

```javascript
app.post("/api/config/profile", async (req, res) => {
  const { displayName, settings, groupId } = req.body;

  // Create a Settings Catalog profile
  const profile = await graphRequest(
    "POST",
    "/deviceManagement/configurationPolicies",
    {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
      name: displayName,
      description: "Created via Intune Command Center",
      platforms: "windows10",
      technologies: "mdm",
      settings,   // Array of setting instances from Settings Catalog
    }
  );

  // Assign to group
  await graphRequest(
    "POST",
    `/deviceManagement/configurationPolicies/${profile.data.id}/assignments`,
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

  res.json({ success: true, profileId: profile.data.id });
});
```

---

### 5G. List Groups (for Assignment Targeting)

**Chatbot trigger**: Used internally when user says "All Devices", "Marketing Department", etc.

```javascript
app.get("/api/groups", async (req, res) => {
  const response = await graphRequest(
    "GET",
    "/groups?$filter=groupTypes/any(g:g eq 'Unified') or securityEnabled eq true&$select=id,displayName,membershipRule"
  );
  res.json(
    response.data.value.map((g) => ({
      id: g.id,
      name: g.displayName,
    }))
  );
});
```

---

## Step 6: Wire the Frontend to Your Backend

Replace the simulated responses in the chatbot's `processMessage` function with real `fetch()` calls to your backend:

```javascript
// Example: Replace the appDeployment case in processMessage
case "appDeployment": {
  if (app) {
    // Look up the group ID from your backend
    const groups = await fetch("/api/groups").then(r => r.json());
    const targetGroup = groups.find(g =>
      g.name.toLowerCase().includes(group.toLowerCase())
    );

    // Deploy the app
    const result = await fetch("/api/apps/deploy-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: app.name,
        packageIdentifier: app.wingetId,  // add WinGet IDs to your app catalog
        description: `Deployed via chatbot`,
        groupId: targetGroup.id,
        intent: "required",
      }),
    }).then(r => r.json());

    // Show success/failure in chat
    addBotMessage(
      result.success
        ? `✅ ${app.name} deployed to ${group}. App ID: ${result.appId}`
        : `❌ Deployment failed. Check permissions and try again.`
    );
  }
  break;
}
```

---

## Step 7: Security Considerations

These are critical for a production deployment — especially for Team 2:

1. **Never expose client secrets in frontend code.** All Graph API calls must go through your backend server.

2. **Use environment variables** for `CLIENT_ID`, `TENANT_ID`, and `CLIENT_SECRET`. Never commit these to source control.

3. **Implement role-based access** in your backend. Not every chatbot user should be able to wipe devices. Check the user's Entra ID role before executing destructive actions.

4. **Add confirmation flows for destructive actions.** The chatbot already has a confirm button for deployments — extend this to wipe, retire, and restart with mandatory device name confirmation.

5. **Audit logging.** Log every action the chatbot takes (who triggered it, what endpoint was called, what device/group was targeted). The Graph API also provides audit logs via `/auditLogs/directoryAudits`.

6. **Token caching.** MSAL handles this automatically, but ensure tokens are cached server-side and refreshed before expiry to avoid unnecessary auth round-trips.

7. **Rate limiting.** Microsoft Graph enforces throttling. Implement retry logic with exponential backoff (check for `429 Too Many Requests` responses and the `Retry-After` header).

---

## Quick Reference: All Endpoints

| Chatbot Action | HTTP Method | Graph API Endpoint |
|---|---|---|
| List devices | GET | `/deviceManagement/managedDevices` |
| Sync device | POST | `/deviceManagement/managedDevices/{id}/syncDevice` |
| Restart device | POST | `/deviceManagement/managedDevices/{id}/rebootNow` |
| Wipe device | POST | `/deviceManagement/managedDevices/{id}/wipe` |
| Retire device | POST | `/deviceManagement/managedDevices/{id}/retire` |
| List apps | GET | `/deviceAppManagement/mobileApps` |
| Create Store app | POST | `/deviceAppManagement/mobileApps` |
| Assign app | POST | `/deviceAppManagement/mobileApps/{id}/assignments` |
| App install status | GET | `/deviceAppManagement/mobileApps/{id}/deviceStatuses` |
| Create update ring | POST | `/deviceManagement/deviceConfigurations` |
| Quality update profile | POST | `/deviceManagement/windowsQualityUpdateProfiles` |
| Feature update profile | POST | `/deviceManagement/windowsFeatureUpdateProfiles` |
| Compliance policies | GET | `/deviceManagement/deviceCompliancePolicies` |
| Config profiles | POST | `/deviceManagement/configurationPolicies` |
| List groups | GET | `/groups` |

**Base URL for all**: `https://graph.microsoft.com/v1.0`
*(Use `/beta` for newer features like expedited updates and Settings Catalog)*

---

## Testing with Graph Explorer

Before writing any code, you can test every endpoint interactively:

1. Go to **[Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)**
2. Sign in with your Intune admin account
3. Consent to the required permissions
4. Try: `GET https://graph.microsoft.com/v1.0/deviceManagement/managedDevices`
5. If you get a `200 OK` with your device list, your permissions are correct

---

## Next Steps

1. Register your app in Entra ID (Step 2)
2. Test endpoints in Graph Explorer
3. Build the backend proxy with the routes from Step 5
4. Replace simulated data in the chatbot with real `fetch()` calls (Step 6)
5. Add authentication for chatbot users (so you can enforce RBAC)
6. Deploy behind HTTPS with proper secret management

For the full Microsoft Graph Intune API reference, see:
**https://learn.microsoft.com/en-us/graph/api/resources/intune-graph-overview**
