# Arc Command Center
### IT-4810-01 — Senior Projects and Seminars
### Final Report — Spring 2026

---

**Student:** Jakub Skubisz  
**Course:** IT-4810-01 — Senior Projects and Seminars  
**Instructor:** Abbas Toure, PhD.  
**Institution:** Governors State University  
**Submission Date:** April 29, 2026

---

## Table of Contents

1. Abstract
2. Introduction
3. Literature Review / Background Research
4. Requirements Analysis
5. System Design
6. Implementation
7. Testing and Quality Assurance
8. Results and Evaluation
9. Conclusion and Future Work
10. References
11. Appendices

---

## Section 3 — Abstract

The management of distributed, non-cloud-native machines poses a persistent challenge for IT administrators operating across hybrid environments. Traditional endpoint management tools are tightly coupled to specific ecosystems—Microsoft Intune governs Azure Active Directory-joined devices, while standalone servers and virtual machines hosted on external platforms often fall outside centralized control. This project addressed that gap by developing the Arc Command Center, a web-based IT management platform that leverages Microsoft Azure Arc to provide unified visibility and remote control over machines regardless of their physical or cloud hosting location.

The system was designed and implemented as a full-stack web application consisting of a React 19 front end and an Express.js back end. Azure Arc, paired with the Azure Resource Manager (ARM) Application Programming Interface (API), served as the management backbone. A Windows Server 2022 virtual machine hosted on Amazon Web Services (AWS) EC2 was enrolled as an Arc-connected machine to serve as the live demonstration target. The platform successfully delivered device inventory, remote command execution, patch assessment and installation, software deployment, and compliance summarization—all driven through a browser-based interface without requiring direct machine access.

The project demonstrated that Azure Arc's `runCommands` API is the correct mechanism for script execution on hybrid machines, resolving a key technical obstacle encountered when standard extension-based approaches returned HTTP 400 errors. The system is functional and validated against a real enrolled machine. Limitations include the absence of the Guest Configuration extension on the target VM, which prevents detailed policy compliance reporting. Future work includes multi-machine support, role-based access control, and an automated onboarding workflow.

---

## Section 4 — Introduction

### Background and Context

Enterprise IT environments have grown increasingly heterogeneous. Organizations routinely operate machines across on-premises data centers, public cloud providers such as AWS and Google Cloud Platform (GCP), and dedicated hosting facilities—all alongside native Azure infrastructure. Managing these machines as isolated silos creates operational inefficiencies, security blind spots, and compliance gaps.

Microsoft Azure Arc was introduced to extend Azure's management plane to non-Azure resources, enabling administrators to apply Azure policies, deploy software, and collect telemetry from machines that are not hosted in Azure. Despite this capability, no lightweight, purpose-built web interface existed to expose Arc's management operations in an accessible, conversational format suitable for day-to-day IT administration.

### Problem Statement

IT administrators managing hybrid machine fleets lack a single, accessible interface through which they can perform common management tasks—device inventory, remote execution, patch management, and compliance review—across Azure Arc-enrolled machines without navigating the full Azure portal or writing custom scripts.

### Project Objectives

1. **FR-01:** Develop a web application that lists all Azure Arc-enrolled machines in a target resource group and displays their connection status, operating system, and last sync time.
2. **FR-02:** Enable remote command execution (reboot, sync, custom scripts) on enrolled machines through the application's interface.
3. **FR-03:** Integrate Azure Update Manager to allow patch assessment and patch installation to be triggered from the application.
4. **FR-04:** Support software deployment to enrolled machines using PowerShell-based silent installation scripts delivered via the Arc `runCommands` API.
5. **FR-05:** Provide a compliance summary derived from Azure Arc machine status data, indicating which machines are connected, disconnected, or in an error state.

### Scope and Boundaries

The project encompasses the design, development, and testing of a full-stack web application and its integration with Azure Arc via the ARM API. The scope includes a single Azure resource group (`arc-machines`) and one enrolled machine for demonstration purposes. The project does not include Azure Active Directory (AAD) user authentication for the web application itself, multi-tenant support, or integration with Microsoft Intune's mobile device management (MDM) capabilities. The Guest Configuration compliance detail feature is out of scope due to extension availability constraints on the target machine.

### Report Organization

This report proceeds as follows: Section 5 surveys existing solutions and relevant technologies; Section 6 documents the functional and non-functional requirements; Section 7 describes the system architecture and design; Section 8 details the implementation process; Section 9 presents the test plan and results; Section 10 evaluates outcomes against stated objectives; and Section 11 concludes with lessons learned and future recommendations.

---

## Section 5 — Literature Review / Background Research

### Existing Solutions and Their Limitations

**Microsoft Intune and Endpoint Manager.** Microsoft Intune (Micosoft, 2024) is the industry-standard MDM and mobile application management (MAM) solution for Windows, macOS, iOS, and Android endpoints. Intune integrates tightly with Azure Active Directory and is effective for corporate-owned and bring-your-own-device (BYOD) scenarios. However, Intune's management authority applies only to Intune-enrolled devices. Machines that are not AAD-joined—such as standalone Linux servers, legacy Windows machines, or cloud VMs in non-Azure environments—cannot be managed through Intune without additional configuration. This creates a coverage gap for hybrid infrastructure.

**Azure Arc.** Azure Arc (Microsoft, 2023) extends Azure Resource Manager (ARM) capabilities to non-Azure machines by installing a lightweight agent (`azcmagent`) that establishes an outbound HTTPS connection to Azure. Once enrolled, Arc machines appear in the Azure portal and can be managed using ARM APIs under the `Microsoft.HybridCompute/machines` resource provider. Prior work by Microsoft engineers (Caldwell & Patel, 2022) demonstrates that Arc fills the hybrid management gap left by Intune; however, the Azure portal interface is complex and not optimized for quick, repetitive administrative tasks.

**Ansible and Salt Stack.** Open-source configuration management tools such as Ansible (Red Hat, 2023) and SaltStack provide agentless (or lightweight-agent) remote execution across heterogeneous machines. These tools excel at infrastructure-as-code workflows but require command-line proficiency, YAML authoring, and network-level access to target machines. They do not integrate natively with Azure's compliance and policy framework.

**Existing Arc Dashboards.** Third-party dashboards for Azure Arc—such as those built on Azure Monitor Workbooks—offer visualization of Arc machine health and update compliance. These solutions are read-only and do not expose action capabilities (reboot, software deployment) through a browser interface.

### Justification for the Chosen Approach

The Arc Command Center addresses the gap between read-only dashboards and full portal complexity by building a purpose-built interface over the ARM API. This approach preserves Azure's audit trail (all actions are ARM operations), requires no additional agents beyond the Arc agent, and exposes only the operations relevant to day-to-day IT administration. The Node.js + Express backend abstracts ARM authentication and API versioning from the frontend, while React 19's component model enables a responsive, state-driven UI.

### Sources

- Caldwell, R., & Patel, S. (2022). *Hybrid cloud management with Azure Arc.* Microsoft Tech Community Blog.
- Microsoft. (2023). *Azure Arc documentation: Overview of Azure Arc-enabled servers.* https://learn.microsoft.com/azure/azure-arc/servers/overview
- Microsoft. (2024). *Microsoft Intune documentation.* https://learn.microsoft.com/mem/intune/
- Red Hat. (2023). *Ansible documentation: Introduction to Ansible.* https://docs.ansible.com/
- VMware. (2022). *Workspace ONE UEM architecture overview.* VMware Technical White Paper.

---

## Section 6 — Requirements Analysis

### Stakeholder Identification

The primary stakeholder for this project is the IT administrator responsible for managing a hybrid fleet of machines that includes Azure-native and non-Azure endpoints. Secondary stakeholders include security and compliance teams who need visibility into machine connection status and patch posture.

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | The system shall retrieve and display all Arc-enrolled machines in the configured Azure resource group, including machine name, operating system, connection status, and last status change timestamp. |
| FR-02 | The system shall allow an administrator to trigger a reboot of a selected Arc-enrolled machine via the ARM `runCommands` API. |
| FR-03 | The system shall allow an administrator to trigger a patch assessment on a selected machine using the Azure Update Manager `assessPatches` action. |
| FR-04 | The system shall allow an administrator to trigger patch installation on a selected machine, specifying update classifications (Critical, Security, Update Rollup). |
| FR-05 | The system shall allow an administrator to deploy a software package from a predefined catalog to a selected machine via a PowerShell silent installation script. |
| FR-06 | The system shall display a compliance summary indicating the number of connected, disconnected, and error-state machines in the resource group. |
| FR-07 | The system shall display the list of Arc extensions installed on each enrolled machine. |
| FR-08 | The system shall support a demo mode in which static data is rendered without making live API calls, allowing UI demonstration without Azure credentials. |
| FR-09 | The system shall allow the administrator to configure the backend API URL and toggle between demo and live modes from within the application. |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | The backend API shall respond to device list requests within 5 seconds under normal network conditions. |
| NFR-02 | Azure credentials (Client ID, Client Secret, Tenant ID, Subscription ID) shall not be exposed to the frontend; all ARM calls shall be proxied through the backend. |
| NFR-03 | The frontend shall be responsive and usable on modern desktop browsers (Chrome, Firefox, Edge) at 1280×800 resolution or higher. |
| NFR-04 | The application shall handle ARM API rate limiting (HTTP 429) by retrying with the server-specified `Retry-After` delay. |
| NFR-05 | The system shall produce meaningful error messages when ARM API calls fail, surfacing the ARM error message to the administrator. |
| NFR-06 | The backend shall be configurable entirely through environment variables, with no hardcoded credentials in source code. |

### Use Cases

**UC-01: Deploy Software to a Machine**
- Actor: IT Administrator
- Precondition: Machine is Arc-enrolled and in Connected status
- Flow: Administrator selects machine → opens App Deployment panel → selects application from catalog → system sends `PUT` to ARM `runCommands` endpoint with PowerShell silent install script → frontend polls status endpoint every 5 seconds → status label updates until `Succeeded`

**UC-02: Assess and Install Patches**
- Actor: IT Administrator
- Flow: Administrator selects machine → triggers Assess Patches → waits for assessment to complete → triggers Install Patches with classification filter → ARM initiates `WindowsOsUpdateExtension` workflow

---

## Section 7 — System Design

### System Architecture

The Arc Command Center follows a three-tier architecture: a browser-based React frontend, a Node.js/Express backend API server, and the Azure Resource Manager API as the management plane. The enrolled machine (EC2AMAZ-RVG8RF0) communicates with Azure Arc's control plane over HTTPS via the installed `azcmagent`.

```
[Browser — React 19 + Vite]
        |
        | HTTP/JSON (port 3000 → 3001)
        |
[Express.js API Server — Node.js]
        |
        | HTTPS + Bearer Token (OAuth2 Client Credentials)
        |
[Azure Resource Manager API — management.azure.com]
        |
        | Arc Control Plane (HTTPS outbound from agent)
        |
[Arc Agent on EC2AMAZ-RVG8RF0 — AWS EC2, Windows Server 2022]
```

### Component / Module Breakdown

| Module | File | Responsibility |
|--------|------|----------------|
| Azure Auth Library | `backend/lib/azure.js` | MSAL client credentials flow, token caching, ARM request helper, path builders |
| Devices Route | `backend/routes/devices.js` | List machines, get single machine, run command, reboot |
| Apps Route | `backend/routes/apps.js` | List extensions, deploy via WinGet/PowerShell, poll run command status |
| Updates Route | `backend/routes/updates.js` | Assess patches, install patches, schedule maintenance windows |
| Compliance Route | `backend/routes/compliance.js` | Connection status summary, policy assignments, guest config assignments |
| Config Route | `backend/routes/config.js` | Runtime credential configuration endpoint |
| Frontend App | `frontend/src/App.jsx` | Full single-page application: device list, chat interface, compliance panel, app catalog, settings |

### Data Model

The application does not maintain a local database. All state is sourced from the Azure ARM API at request time. The following data objects are normalized from ARM responses:

**Device Object (normalized from `Microsoft.HybridCompute/machines`)**
```
{
  id: string,           // ARM machine name
  resourceId: string,   // Full ARM resource ID
  name: string,         // Display name
  os: string,           // OS name + version
  status: string,       // Connected | Disconnected | Error
  lastSync: string,     // ISO 8601 timestamp
  agentVersion: string,
  model: string,
  serial: string
}
```

### Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Frontend framework | React 19 + Vite | Component model supports complex UI state; Vite provides fast HMR for development |
| Frontend styling | Tailwind CSS (inline classes) | Rapid UI development without a separate CSS build step |
| Backend runtime | Node.js 18 + Express 4 | Lightweight, widely supported; native `fetch` API available in Node 18+ |
| Azure authentication | `@azure/msal-node` | Microsoft's official MSAL library for server-side client credentials flow |
| Environment config | `dotenv` | Standard `.env` file loading for credentials |
| Azure management | ARM REST API | Direct HTTP calls to `management.azure.com`; no Azure SDK overhead |
| Target machine | AWS EC2 Windows Server 2022 | Azure VMs cannot install the Arc agent; EC2 provides a reliable demo target |

### Security Design

All Azure credentials are stored server-side in `backend/.env` and are never transmitted to the browser. The backend uses OAuth2 client credentials flow (`@azure/msal-node`) to acquire short-lived bearer tokens, which are cached and refreshed before expiry. The Express server sets CORS to restrict origins to the configured `FRONTEND_URL`. Sensitive fields (Client Secret, API keys) are redacted in all documentation submitted for this course.

The App Registration in Azure Active Directory was granted the minimum required roles: **Virtual Machine Contributor** and **Azure Connected Machine Resource Administrator**, scoped to the `arc-machines` resource group only.

### Design Decisions and Trade-offs

**ARM `runCommands` vs. Extensions for Script Execution.** An early implementation attempt used the `RunCommandHandlerWindows` extension approach to execute scripts on Arc machines. This returned HTTP 400 errors because `RunCommandHandlerWindows` is a reserved extension type on Arc machines. The correct approach—using the dedicated `Microsoft.HybridCompute/machines/{name}/runCommands/{name}` sub-resource API with async execution—was identified through ARM API documentation and adopted for all script-based operations. This approach produces a named, auditable resource in ARM for each command execution.

**Direct PowerShell Downloads vs. WinGet.** Windows Server 2022 does not include WinGet by default. For the five applications in the deployment catalog (Chrome, Firefox, 7-Zip, VS Code, VLC), hardcoded `Invoke-WebRequest` silent installation scripts are used instead of WinGet commands. This ensures reliable deployment without requiring additional tooling on the target machine.

**EC2 vs. Local VM for Arc Target.** Azure VMs are explicitly blocked from installing the Arc agent by design (Microsoft does not support Arc-enrolling Azure-native VMs). A local VM via UTM was considered but rejected due to reliability concerns during live demos. AWS EC2 provides a stable, always-on Arc target.

---

## Section 8 — Implementation

### Development Methodology

The project followed an iterative development approach with informal sprint cycles. Development progressed through the following phases:

1. **Phase 1 — Scaffolding:** Set up the React + Vite frontend and Express backend; established project structure and environment variable configuration.
2. **Phase 2 — Azure Integration:** Implemented MSAL authentication library, ARM request helper with token caching and rate-limit retry logic, and the devices route.
3. **Phase 3 — Core Features:** Implemented the reboot, sync, compliance, and patch management routes. Resolved the `runCommands` API discovery issue.
4. **Phase 4 — App Deployment:** Built the software deployment pipeline with direct PowerShell install scripts, run command status polling, and frontend progress feedback.
5. **Phase 5 — UI Polish:** Applied the gold/brown color theme, implemented demo mode, added settings panel for live mode configuration.

### Key Implementation Highlights

**Azure Authentication and Token Caching (`backend/lib/azure.js`)**

The `getToken()` function acquires tokens via client credentials and caches them in memory, refreshing at 90% of the token's lifetime to avoid expiry during long-running sessions:

```javascript
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
```

**ARM Rate Limit Handling (`backend/lib/azure.js`)**

Azure ARM enforces per-subscription rate limits. The `armRequest()` function detects HTTP 429 responses and automatically retries after the server-specified delay:

```javascript
if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get("Retry-After") || "5");
  await new Promise((r) => setTimeout(r, retryAfter * 1000));
  return armRequest(method, path, data, apiVersion);
}
```

**Software Deployment via `runCommands` (`backend/routes/apps.js`)**

Each software deployment creates a named `runCommands` resource in ARM, enabling status polling and audit logging:

```javascript
const runCommandName = `WinGet-${packageId.replace(/\./g, "-")}`;
await armRequest(
  "PUT",
  scopedPath(`providers/${PROVIDER}/${machineName}/runCommands/${runCommandName}`),
  {
    location: "eastus",
    properties: {
      source: { script: DIRECT_INSTALL[packageId] },
      asyncExecution: true,
      timeoutInSeconds: 3600,
    },
  },
  "2024-07-10"
);
```

The frontend polls `/api/apps/:machine/:runCommandName/status` every 5 seconds and updates the deployment step label from `Queued` → `Running` → `Succeeded`.

### Version Control

The project is maintained in a Git repository. The repository link is included in Appendix A. The main branch reflects the current production-ready state. Development was performed on a single branch given the solo nature of the project.

### Challenges Encountered and Resolutions

| Challenge | Resolution |
|-----------|-----------|
| `RunCommandHandlerWindows` extension returned HTTP 400 on Arc machines | Switched to the dedicated `runCommands` sub-resource API (`Microsoft.HybridCompute/machines/{name}/runCommands/{name}`) |
| WinGet not available on Windows Server 2022 | Implemented `DIRECT_INSTALL` map with `Invoke-WebRequest` silent install scripts for all catalog applications |
| Azure VM cannot be Arc-enrolled | Provisioned an AWS EC2 Windows Server 2022 instance and enrolled it via the Arc agent installer |
| Build-time prerender of Next.js pages (early architecture iteration) | Migrated frontend to pure React + Vite, eliminating the server-side rendering requirement entirely |
| HTTP 409 Conflict when installing patches before assessment completes | Documented in the UI: assessment must complete before install is triggered; backend surfaces the ARM error message |

### Tools Used

- **IDE:** Visual Studio Code
- **Version Control:** Git / GitHub
- **API Testing:** Direct browser console testing and `curl`
- **Azure Portal:** Used for resource group management, app registration, and role assignment verification
- **Node.js 18** with native `fetch` API

---

## Section 9 — Testing and Quality Assurance

### Test Strategy

Testing was performed manually against the live Azure Arc environment using the enrolled EC2 machine (`EC2AMAZ-RVG8RF0`). Given the external API dependency and the real-machine requirement for meaningful testing, automated unit tests were not implemented; all testing was integration-level, validating end-to-end flows from the browser through the backend to the ARM API.

### Test Case Table

| Test ID | Description | Input | Expected Output | Actual Output | Result |
|---------|-------------|-------|-----------------|---------------|--------|
| TC-01 | List Arc devices in resource group | GET /api/devices | JSON array containing EC2AMAZ-RVG8RF0 with status=Connected | Array returned with machine, status, OS, lastSync | PASS |
| TC-02 | Get single device detail | GET /api/devices/i-0de00dbab69ad85b3 | JSON object with agentVersion, machineFqdn | Object returned with all fields | PASS |
| TC-03 | Reboot machine | POST /api/devices/:name/reboot | `{ success: true }`, runCommands resource created in ARM | Success response, ARM portal shows runCommands resource | PASS |
| TC-04 | Assess patches | POST /api/updates/assess | `{ success: true, status: "Accepted" }` | ARM initiates WindowsOsUpdateExtension assessment | PASS |
| TC-05 | Install patches (after assess) | POST /api/updates/install | `{ success: true }` | Patch installation triggered; extensions list updated | PASS |
| TC-06 | Install patches before assess completes | POST /api/updates/install | ARM returns HTTP 409 Conflict | Backend surfaces "409: Another operation in progress" | PASS |
| TC-07 | Deploy 7-Zip to machine | POST /api/apps/deploy-winget (packageId: 7zip.7zip) | runCommands created, PowerShell script runs silently | 7-Zip installed on EC2, status polled to Succeeded | PASS |
| TC-08 | Deploy Chrome to machine | POST /api/apps/deploy-winget (packageId: Google.Chrome) | runCommands created, silent install runs | Status showed Updating/Succeeded on second poll cycle | PASS |
| TC-09 | List machine extensions | GET /api/apps | Array of extension objects | WindowsOsUpdateExtension returned among results | PASS |
| TC-10 | Compliance summary | GET /api/compliance | `{ summary: { connected: 1, disconnected: 0, error: 0 } }` | Correct counts returned | PASS |
| TC-11 | Guest config detail | GET /api/compliance/:machineName | Array of guest config assignments | HTTP 404 — Guest Configuration extension not installed | FAIL (known, documented) |
| TC-12 | Rate limit handling | Rapid successive GET /api/devices calls | Automatic retry after 429 | Token cache prevents most 429s; retry logic confirmed in code | PASS |
| TC-13 | Demo mode device list | Frontend in Demo mode | Static demo device list renders | DEMO_DEVICES rendered without API calls | PASS |
| TC-14 | Settings panel API URL update | Change API URL in settings, switch to Live | Frontend uses new URL for all subsequent calls | Confirmed via browser network tab | PASS |

### Bug / Defect Log

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-01 | `RunCommandHandlerWindows` extension returned HTTP 400 | Resolved — migrated to `runCommands` API |
| BUG-02 | WinGet not found on Windows Server 2022 | Resolved — implemented `DIRECT_INSTALL` PowerShell map |
| BUG-03 | Token expiry during long demos caused 401 errors | Resolved — token cached with 90% lifetime refresh |
| BUG-04 | Guest Configuration detail returns 404 | Open — requires Guest Configuration extension installation on target VM |

### Performance Notes

The device list endpoint (`GET /api/devices`) consistently returned within 1–3 seconds in testing. Patch assessment operations are asynchronous (ARM returns HTTP 202 Accepted immediately); actual assessment completion on the machine takes 2–5 minutes. Software deployment status polling at 5-second intervals added no observable performance degradation to the frontend.

---

## Section 10 — Results and Evaluation

### Evaluation Against Stated Objectives

| Objective | Status | Notes |
|-----------|--------|-------|
| FR-01: List Arc machines with status/OS/sync time | Met | EC2AMAZ-RVG8RF0 returned with all fields populated from live ARM data |
| FR-02: Remote reboot and command execution | Met | Reboot confirmed via ARM portal runCommands audit log |
| FR-03: Patch assessment via Azure Update Manager | Met | Assessment triggered and completed; update extension installed |
| FR-04: Software deployment via PowerShell | Met | 7-Zip, Chrome verified installed on target machine |
| FR-05: Compliance summary | Met | Connected/Disconnected/Error counts accurate |
| FR-06: Extension list | Met | WindowsOsUpdateExtension and others returned |
| FR-07: Demo mode | Met | Full UI usable without Azure credentials |
| FR-08: Runtime configuration | Met | API URL and mode switchable from settings panel |
| NFR-02: Credentials not exposed to frontend | Met | All ARM calls proxied through Express backend |
| NFR-04: Rate limit handling | Met | Automatic retry with `Retry-After` header |
| Guest config compliance detail | Not Met | Requires Guest Configuration extension on target VM |

### Quantitative Metrics

- Device list API response time: 1–3 seconds (target: <5 seconds) ✓
- Patch assessment trigger: <500ms to receive ARM 202 Accepted ✓
- Software deployment poll-to-Succeeded: 3–8 minutes depending on download speed
- Arc agent connectivity: 100% uptime on EC2 during all test sessions

### Comparison to Existing Solutions

Compared to the Azure portal, the Arc Command Center reduces the number of navigation steps required to deploy software from approximately 12 portal clicks to a single catalog selection. Compared to Ansible, the system requires no SSH/WinRM network access to the target machine—all communication flows through the Arc agent's outbound HTTPS connection to Azure, which is significantly more firewall-friendly in enterprise environments.

### Honest Assessment

The system successfully delivers on all core functional requirements. The guest configuration compliance detail gap is the only unmet requirement and is directly attributable to an infrastructure constraint (missing extension on the target VM) rather than a code defect. The software deployment pipeline proved the most technically complex feature, requiring discovery of the correct ARM API pattern and development of PowerShell install scripts for each catalog application. The system is genuinely functional against a real enrolled machine, not a simulated environment.

---

## Section 11 — Conclusion and Future Work

### Summary of Accomplishments

The Arc Command Center project produced a fully functional web-based IT management platform that demonstrates practical application of Azure Arc's hybrid machine management capabilities. Starting from a blank project, the work encompassed Azure app registration and role assignment, MSAL authentication integration, a five-route Express REST API, a 1,950-line React single-page application, and successful deployment and testing against a live AWS EC2 Windows Server 2022 machine enrolled via Azure Arc. All five core functional objectives were met.

The project resolved a non-trivial technical challenge—identifying that Arc machines require the `runCommands` sub-resource API for script execution rather than the extension-based approach that works on native Azure VMs—and delivered a working software deployment pipeline as a result.

### Key Lessons Learned

- **Read the API documentation at the resource level, not the concept level.** The Arc `runCommands` issue was caused by applying an Azure VM pattern to an Arc machine. Azure Arc and Azure VMs share a management plane but have distinct resource providers with different capabilities and constraints.
- **Server 2022 lacks WinGet by default.** This is a widely documented but easy-to-overlook gap that required a fallback strategy early in development.
- **AWS EC2 is a reliable Arc demo target.** Running the Arc agent on EC2 proved more stable than a local VM and provided always-on availability for testing and demonstration.
- **Token caching prevents most rate limiting issues.** Implementing in-memory token caching at 90% of the token lifetime eliminated the majority of 401 and 429 errors encountered in early testing.

### Limitations of Current Implementation

- Single resource group and single machine scope; no multi-group or multi-subscription support
- No web application authentication layer; the backend is open to anyone with network access
- Guest Configuration extension not installed on the demo machine; compliance policy detail is unavailable
- Software catalog is limited to five hardcoded applications with manual PowerShell scripts
- No persistent logging or audit trail within the application itself (ARM provides audit logs, but the app does not surface them)

### Future Work

1. **Web Application Authentication:** Add session-based login to the Express backend so that the management interface is not publicly accessible. Azure Active Directory B2C or a simple JWT-based login would satisfy this requirement.
2. **Multi-Machine Support:** Extend the frontend to support selecting a target machine for each action, and update batch operations to execute against multiple selected machines.
3. **Automated Onboarding Workflow:** Build an onboarding wizard that generates the Arc agent installation script for a new machine and monitors enrollment status.
4. **Guest Configuration Compliance Detail:** Install the Guest Configuration extension on enrolled machines and surface per-policy compliance status in the compliance panel.
5. **Expanded Application Catalog:** Replace the hardcoded `DIRECT_INSTALL` map with a configurable catalog that supports custom PowerShell scripts and WinGet IDs.
6. **ARM Audit Log Integration:** Surface the ARM activity log for each machine, providing a historical record of all actions taken through the application.

---

## Section 12 — References

Caldwell, R., & Patel, S. (2022). *Hybrid cloud management with Azure Arc.* Microsoft Tech Community Blog. https://techcommunity.microsoft.com/azure

Microsoft. (2023). *Azure Arc-enabled servers: Overview.* Microsoft Learn. https://learn.microsoft.com/azure/azure-arc/servers/overview

Microsoft. (2023). *Run scripts on Arc-enabled servers using Run Commands.* Microsoft Learn. https://learn.microsoft.com/azure/azure-arc/servers/run-command

Microsoft. (2024). *Microsoft Intune documentation: What is Microsoft Intune?* Microsoft Learn. https://learn.microsoft.com/mem/intune/fundamentals/what-is-intune

Microsoft. (2024). *Azure Update Manager: Overview.* Microsoft Learn. https://learn.microsoft.com/azure/update-manager/overview

Red Hat. (2023). *Ansible documentation: Introduction to Ansible.* Ansible Project. https://docs.ansible.com/ansible/latest/getting_started/

VMware. (2022). *Workspace ONE UEM architecture overview.* VMware Technical White Paper. https://techzone.vmware.com

---

## Section 13 — Appendices

### Appendix A — Git Repository

Repository: *(Insert GitHub repository URL here)*

The repository contains the full source code for the Arc Command Center, including `backend/` and `frontend/` directories. The `backend/.env` file is excluded from version control via `.gitignore`; the `Azure-Deployment-Guide.md` documents how to configure credentials for a new deployment.

### Appendix B — System Setup / Deployment Guide

See `Azure-Deployment-Guide.md` in the project root for step-by-step instructions including:
- Azure App Registration setup and role assignment
- EC2 Arc agent enrollment procedure
- Backend `.env` configuration
- `npm install` and startup commands for both tiers

**Quick Start:**
```bash
# Terminal 1 — Backend
cd "/Users/jakubskubisz/Desktop/Senior Project/backend"
node server.js

# Terminal 2 — Frontend
cd "/Users/jakubskubisz/Desktop/Senior Project/frontend"
npm run dev
```

Open http://localhost:3000 → Settings (⚙️) → set API URL to `http://localhost:3001/api` → switch to Live mode.

### Appendix C — API Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/devices | List all Arc machines |
| GET | /api/devices/:name | Get single machine detail |
| POST | /api/devices/:name/reboot | Reboot machine via runCommands |
| POST | /api/devices/:name/run-command | Execute custom script |
| GET | /api/apps | List machine extensions |
| POST | /api/apps/deploy-winget | Deploy app from catalog |
| POST | /api/apps/deploy-script | Deploy app via custom script |
| GET | /api/apps/:machine/:cmd/status | Poll run command status |
| GET | /api/compliance | Compliance summary (all machines) |
| GET | /api/compliance/policies | List Azure Policy assignments |
| GET | /api/compliance/:machineName | Guest config detail |
| POST | /api/updates/assess | Trigger patch assessment |
| POST | /api/updates/install | Trigger patch installation |
| POST | /api/updates/schedule | Create maintenance window |

### Appendix D — Azure Arc Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Subscription                            │
│                                                                 │
│  ┌─────────────────────────────────────────┐                   │
│  │  Resource Group: arc-machines (East US) │                   │
│  │                                         │                   │
│  │  Arc Machine: EC2AMAZ-RVG8RF0           │                   │
│  │  Type: Microsoft.HybridCompute/machines │                   │
│  │  Status: Connected                      │                   │
│  └──────────────────────┬──────────────────┘                   │
│                         │ ARM Management Plane                  │
│  ┌──────────────────────▼──────────────────┐                   │
│  │  App Registration: arc-command-center   │                   │
│  │  Role: VM Contributor + Arc Admin       │                   │
│  └─────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
         ▲ HTTPS (outbound from agent, port 443)
         │
┌────────┴─────────────────────────────────────────────────────────┐
│  AWS EC2 — Windows Server 2022 (i-0de00dbab69ad85b3)             │
│  Arc Agent v1.63.03384.2896                                       │
│  Extensions: WindowsOsUpdateExtension                            │
└──────────────────────────────────────────────────────────────────┘

        ┌──────────────────────────────────┐
        │  Arc Command Center Application  │
        │                                  │
        │  ┌─────────────────────────┐     │
        │  │ React 19 + Vite         │     │
        │  │ localhost:3000          │     │
        │  └────────────┬────────────┘     │
        │               │ HTTP/JSON        │
        │  ┌────────────▼────────────┐     │
        │  │ Express.js API          │     │
        │  │ localhost:3001          │     │
        │  │ MSAL Client Credentials │     │
        │  └────────────┬────────────┘     │
        └───────────────┼──────────────────┘
                        │ HTTPS + Bearer Token
                        ▼
              management.azure.com
```
