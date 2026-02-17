import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// CONFIGURATION — Set your Azure App Service backend URL here
// ============================================================
const DEFAULT_API_URL = "https://intune-command-center.azurewebsites.net/api";

// WinGet package identifiers for common apps
const APP_CATALOG = [
  { name: "Google Chrome", wingetId: "Google.Chrome", type: "Win32", size: "120 MB" },
  { name: "Mozilla Firefox", wingetId: "Mozilla.Firefox", type: "Win32", size: "95 MB" },
  { name: "Zoom Workplace", wingetId: "Zoom.Zoom", type: "Store", size: "45 MB" },
  { name: "Slack", wingetId: "SlackTechnologies.Slack", type: "Store", size: "78 MB" },
  { name: "Adobe Acrobat Reader", wingetId: "Adobe.Acrobat.Reader.64-bit", type: "Win32", size: "210 MB" },
  { name: "Microsoft Teams", wingetId: "Microsoft.Teams", type: "M365", size: "Bundled" },
  { name: "7-Zip", wingetId: "7zip.7zip", type: "Win32", size: "5 MB" },
  { name: "Visual Studio Code", wingetId: "Microsoft.VisualStudioCode", type: "Win32", size: "95 MB" },
  { name: "Notepad++", wingetId: "Notepad++.Notepad++", type: "Win32", size: "12 MB" },
  { name: "VLC Media Player", wingetId: "VideoLAN.VLC", type: "Win32", size: "42 MB" },
];

const DEMO_DEVICES = [
  { id: "d1", name: "IVY-PC-001", user: "Sarah Mitchell", os: "Windows 11 23H2", status: "Compliant", lastSync: "2 min ago" },
  { id: "d2", name: "IVY-PC-002", user: "James Torres", os: "Windows 11 23H2", status: "Compliant", lastSync: "15 min ago" },
  { id: "d3", name: "IVY-LT-003", user: "Emily Chen", os: "Windows 11 22H2", status: "Non-Compliant", lastSync: "3 hrs ago" },
  { id: "d4", name: "IVY-LT-004", user: "Marcus Wright", os: "Windows 10 22H2", status: "Compliant", lastSync: "1 hr ago" },
  { id: "d5", name: "IVY-PC-005", user: "Priya Sharma", os: "Windows 11 23H2", status: "In Grace Period", lastSync: "45 min ago" },
  { id: "d6", name: "IVY-LT-006", user: "Derek Johnson", os: "Windows 10 21H2", status: "Non-Compliant", lastSync: "1 day ago" },
];

const DEMO_GROUPS = [
  { id: "g-all-devices", name: "All Devices" },
  { id: "g-all-users", name: "All Users" },
  { id: "g-marketing", name: "Marketing Department" },
  { id: "g-engineering", name: "Engineering Team" },
  { id: "g-executives", name: "Executive Devices" },
  { id: "g-remote", name: "Remote Workers" },
  { id: "g-byod", name: "BYOD Devices" },
];

const INTUNE_KEYWORDS = {
  appDeployment: ["install", "deploy", "app", "application", "software", "push app", "add app", "new app"],
  updates: ["update", "patch", "windows update", "feature update", "quality update", "upgrade"],
  compliance: ["compliance", "compliant", "noncompliant", "policy check"],
  devices: ["device", "pc", "computer", "laptop", "enroll", "wipe", "retire", "restart", "sync", "reboot"],
  monitor: ["monitor", "status", "report", "dashboard", "health", "check status", "overview"],
  config: ["configure", "configuration", "profile", "setting", "date", "time", "region", "restrict"],
};

function classifyIntent(msg) {
  const lower = msg.toLowerCase();
  for (const [cat, kws] of Object.entries(INTUNE_KEYWORDS)) {
    for (const kw of kws) { if (lower.includes(kw)) return cat; }
  }
  return null;
}

function findApp(msg) {
  const lower = msg.toLowerCase();
  return APP_CATALOG.find(a => lower.includes(a.name.toLowerCase()));
}

function findGroupName(msg) {
  const lower = msg.toLowerCase();
  const g = DEMO_GROUPS.find(g => lower.includes(g.name.toLowerCase()));
  return g ? g.name : "All Devices";
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? "s" : ""} ago`;
}

function normalizeStatus(s) {
  if (!s) return "Pending";
  const map = { compliant: "Compliant", noncompliant: "Non-Compliant", inGracePeriod: "In Grace Period", unknown: "Pending" };
  return map[s] || s;
}

// ============================================================
// API LAYER — all calls go through here
// ============================================================
function createApi(baseUrl, isLive) {
  async function call(method, path, body = null) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${baseUrl}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `API error ${res.status}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
  }

  return {
    // Devices
    async getDevices() {
      if (!isLive) return DEMO_DEVICES;
      const data = await call("GET", "/devices");
      return data.map(d => ({
        id: d.id,
        name: d.name,
        user: d.user,
        os: d.os,
        status: normalizeStatus(d.status),
        lastSync: timeAgo(d.lastSync),
      }));
    },

    async syncDevice(deviceId) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${deviceId}/sync`);
    },

    async rebootDevice(deviceId) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${deviceId}/reboot`);
    },

    async wipeDevice(deviceId) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${deviceId}/wipe`, { keepUserData: false });
    },

    async retireDevice(deviceId) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${deviceId}/retire`);
    },

    // Apps
    async deployApp(displayName, packageId, groupId) {
      if (!isLive) return { success: true, appId: "demo-" + Date.now() };
      return call("POST", "/apps/deploy-store", { displayName, packageIdentifier: packageId, groupId });
    },

    // Updates
    async pushQualityUpdate(groupId) {
      if (!isLive) return { success: true, profileId: "demo-qu-" + Date.now() };
      return call("POST", "/updates/quality", { groupId, releaseDate: new Date().toISOString().split("T")[0] });
    },

    async pushFeatureUpdate(groupId, version) {
      if (!isLive) return { success: true, profileId: "demo-fu-" + Date.now() };
      return call("POST", "/updates/feature", { groupId, featureUpdateVersion: version || "Windows 11, version 24H2" });
    },

    async createUpdateRing(groupId, deferral) {
      if (!isLive) return { success: true, ringId: "demo-ring-" + Date.now() };
      return call("POST", "/updates/ring", { groupId, qualityDeferral: deferral || 0, featureDeferral: deferral || 0 });
    },

    // Compliance
    async getCompliance() {
      if (!isLive) {
        const devices = DEMO_DEVICES;
        const summary = { compliant: 0, noncompliant: 0, inGracePeriod: 0 };
        devices.forEach(d => {
          if (d.status === "Compliant") summary.compliant++;
          else if (d.status === "Non-Compliant") summary.noncompliant++;
          else if (d.status === "In Grace Period") summary.inGracePeriod++;
        });
        return { summary, devices };
      }
      return call("GET", "/compliance");
    },

    // Groups
    async getGroups() {
      if (!isLive) return DEMO_GROUPS;
      return call("GET", "/config/groups");
    },

    // Config profile
    async createConfigProfile(displayName, settings, groupId) {
      if (!isLive) return { success: true, profileId: "demo-cfg-" + Date.now() };
      return call("POST", "/config/profile", { displayName, settings, groupId });
    },

    // Health
    async checkHealth() {
      if (!isLive) return { status: "ok", service: "Demo Mode" };
      return call("GET", "/health");
    },
  };
}

// ============================================================
// UI COMPONENTS
// ============================================================
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 0", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#64748b",
          animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    Compliant: { bg: "#0d3320", text: "#34d399", border: "#166534" },
    "Non-Compliant": { bg: "#3b1118", text: "#f87171", border: "#7f1d1d" },
    "In Grace Period": { bg: "#3b2e10", text: "#fbbf24", border: "#78350f" },
    Pending: { bg: "#1e293b", text: "#94a3b8", border: "#334155" },
    Deployed: { bg: "#0d3320", text: "#34d399", border: "#166534" },
    Queued: { bg: "#172554", text: "#60a5fa", border: "#1e3a5f" },
    Error: { bg: "#3b1118", text: "#f87171", border: "#7f1d1d" },
  };
  const c = colors[status] || colors.Pending;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      letterSpacing: 0.3, textTransform: "uppercase",
    }}>{status}</span>
  );
}

function ActionCard({ icon, title, subtitle, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#1a2744" : "#0f1a2e",
        border: `1px solid ${hovered ? "#3b82f6" : "#1e293b"}`,
        borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left",
        transition: "all 0.2s ease", transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered ? "0 4px 20px rgba(59,130,246,0.15)" : "none", width: "100%",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
    </button>
  );
}

function InfoBox({ color, borderColor, bg, children }) {
  return (
    <div style={{ marginTop: 8, padding: "12px 16px", background: bg, border: `1px solid ${borderColor}`, borderRadius: 10, color, fontSize: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function DeviceTable({ devices, onAction, selectable, selected, onSelect }) {
  const allSelected = selectable && selected && devices.length > 0 && devices.every(d => selected.includes(d.id));
  const someSelected = selectable && selected && selected.length > 0 && !allSelected;
  const toggleAll = () => {
    if (!onSelect) return;
    if (allSelected) onSelect([]);
    else onSelect(devices.map(d => d.id));
  };
  const toggleOne = (id) => {
    if (!onSelect) return;
    if (selected.includes(id)) onSelect(selected.filter(s => s !== id));
    else onSelect([...selected, id]);
  };

  const checkboxStyle = (checked) => ({
    width: 16, height: 16, borderRadius: 4, cursor: "pointer",
    border: checked ? "none" : "2px solid #334155",
    background: checked ? "linear-gradient(135deg, #2563eb, #3b82f6)" : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all 0.15s ease",
  });

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1e293b", marginTop: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#0c1524" }}>
            {selectable && (
              <th style={{ padding: "10px 10px 10px 14px", borderBottom: "1px solid #1e293b", width: 36 }}>
                <div onClick={toggleAll} style={checkboxStyle(allSelected)}>
                  {allSelected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                  {someSelected && !allSelected && <span style={{ color: "#fff", fontSize: 10 }}>—</span>}
                </div>
              </th>
            )}
            {["Device", "User", "OS", "Status", "Last Sync", ...(onAction ? ["Actions"] : [])].map(h => (
              <th key={h} style={{
                padding: "10px 14px", textAlign: "left", color: "#64748b",
                fontWeight: 600, fontSize: 10, textTransform: "uppercase",
                letterSpacing: 0.8, borderBottom: "1px solid #1e293b",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map((d, i) => {
            const isChecked = selectable && selected && selected.includes(d.id);
            return (
              <tr key={d.id || i} onClick={() => selectable && toggleOne(d.id)}
                style={{
                  borderBottom: "1px solid #1e293b", cursor: selectable ? "pointer" : "default",
                  background: isChecked ? "#0f1d3a" : "transparent",
                  transition: "background 0.15s ease",
                }}>
                {selectable && (
                  <td style={{ padding: "10px 10px 10px 14px", width: 36 }}>
                    <div style={checkboxStyle(isChecked)}>
                      {isChecked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                    </div>
                  </td>
                )}
                <td style={{ padding: "10px 14px", color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{d.name}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{d.user}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{d.os}</td>
                <td style={{ padding: "10px 14px" }}><StatusBadge status={d.status} /></td>
                <td style={{ padding: "10px 14px", color: "#64748b" }}>{d.lastSync}</td>
                {onAction && (
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[{ label: "⟳", action: "sync", title: "Sync" }, { label: "↻", action: "reboot", title: "Restart" }].map(a => (
                        <button key={a.action} title={a.title}
                          onClick={(e) => { e.stopPropagation(); onAction(d.id, d.name, a.action); }}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: "1px solid #1e293b",
                            background: "#0f1a2e", color: "#94a3b8", cursor: "pointer", fontSize: 13,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{a.label}</button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BulkActionBar({ count, onSync, onReboot, onWipe, onRetire, onClear, busy }) {
  const btnBase = {
    padding: "7px 14px", borderRadius: 8, border: "none", fontWeight: 600,
    fontSize: 12, cursor: busy ? "not-allowed" : "pointer", transition: "all 0.2s",
    opacity: busy ? 0.5 : 1, display: "flex", alignItems: "center", gap: 5,
  };
  return (
    <div style={{
      marginTop: 10, padding: "12px 16px", background: "#0c1524",
      border: "1px solid #3b82f6", borderRadius: 10,
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
      animation: "fadeSlideIn 0.2s ease",
    }}>
      <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff",
          borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
        }}>{count}</span>
        device{count !== 1 ? "s" : ""} selected
        <button onClick={onClear} style={{
          background: "none", border: "none", color: "#64748b", cursor: "pointer",
          fontSize: 11, textDecoration: "underline",
        }}>Clear</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={onSync} disabled={busy} style={{ ...btnBase, background: "#172554", color: "#60a5fa" }}>
          ⟳ Sync
        </button>
        <button onClick={onReboot} disabled={busy} style={{ ...btnBase, background: "#3b2e10", color: "#fbbf24" }}>
          ↻ Restart
        </button>
        <button onClick={onRetire} disabled={busy} style={{ ...btnBase, background: "#2d1a2e", color: "#c084fc" }}>
          ⏏ Retire
        </button>
        <button onClick={onWipe} disabled={busy} style={{ ...btnBase, background: "#3b1118", color: "#f87171" }}>
          ⚠ Wipe
        </button>
      </div>
    </div>
  );
}

function DeployCard({ title, subtitle, meta, gradient, onDeploy, status }) {
  return (
    <div style={{ background: "#0f1a2e", border: "1px solid #1e293b", borderRadius: 12, padding: 18, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{title}</div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{subtitle}</div>
          {meta && <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{meta}</div>}
        </div>
        <StatusBadge status={status === "deployed" ? "Deployed" : status === "deploying" ? "Queued" : status === "error" ? "Error" : "Pending"} />
      </div>
      {status === "idle" && (
        <button onClick={onDeploy} style={{
          marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
          fontWeight: 600, fontSize: 13, cursor: "pointer",
          background: `linear-gradient(135deg, ${gradient})`, color: "#fff",
          transition: "all 0.3s", letterSpacing: 0.3,
        }}>🚀 Confirm & Deploy</button>
      )}
      {status === "deploying" && (
        <div style={{ marginTop: 14, padding: "10px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
          <span style={{ animation: "typingBounce 1s infinite" }}>⏳</span> Calling Microsoft Graph API...
        </div>
      )}
      {status === "deployed" && (
        <InfoBox color="#34d399" borderColor="#166534" bg="#0d3320">
          ✓ Successfully deployed via Microsoft Graph API. Devices will apply changes on next sync cycle.
        </InfoBox>
      )}
      {status === "error" && (
        <InfoBox color="#f87171" borderColor="#7f1d1d" bg="#3b1118">
          ✗ Deployment failed. Check API connection and permissions. Try again or check Azure portal.
        </InfoBox>
      )}
    </div>
  );
}

function SettingsPanel({ apiUrl, setApiUrl, isLive, setIsLive, onClose, onTest }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await onTest();
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#0c1524", border: "1px solid #1e293b", borderRadius: 16,
        padding: 24, width: "100%", maxWidth: 440,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 700 }}>⚙️ Connection Settings</div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer",
          }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Mode
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {[{ label: "Demo", value: false, desc: "Simulated data" }, { label: "Live", value: true, desc: "Azure backend" }].map(m => (
              <button key={m.label} onClick={() => setIsLive(m.value)} style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                background: isLive === m.value ? "#172554" : "#0f1a2e",
                border: `1px solid ${isLive === m.value ? "#3b82f6" : "#1e293b"}`,
                color: isLive === m.value ? "#60a5fa" : "#64748b", textAlign: "center",
              }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16, opacity: isLive ? 1 : 0.4, pointerEvents: isLive ? "auto" : "none" }}>
          <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Azure API Base URL
          </label>
          <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
            placeholder="https://your-app.azurewebsites.net/api"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10, marginTop: 6,
              border: "1px solid #1e293b", background: "#111827", color: "#e2e8f0",
              fontSize: 13, outline: "none", fontFamily: "'JetBrains Mono', monospace",
            }} />
        </div>

        {isLive && (
          <button onClick={runTest} disabled={testing} style={{
            width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid #1e293b",
            background: "#0f1a2e", color: "#94a3b8", fontSize: 13, fontWeight: 600,
            cursor: testing ? "not-allowed" : "pointer", marginBottom: 12,
          }}>
            {testing ? "Testing connection..." : "🔌 Test Connection"}
          </button>
        )}

        {testResult && (
          <InfoBox
            color={testResult.ok ? "#34d399" : "#f87171"}
            borderColor={testResult.ok ? "#166534" : "#7f1d1d"}
            bg={testResult.ok ? "#0d3320" : "#3b1118"}
          >
            {testResult.ok ? `✓ Connected: ${testResult.service}` : `✗ ${testResult.error}`}
          </InfoBox>
        )}

        <div style={{ marginTop: 16, padding: "12px 14px", background: "#0f1a2e", border: "1px solid #1e293b", borderRadius: 10, color: "#64748b", fontSize: 11, lineHeight: 1.6 }}>
          <strong style={{ color: "#94a3b8" }}>Setup required for Live mode:</strong><br />
          1. Deploy the Node.js backend to Azure App Service<br />
          2. Register an app in Entra ID with Graph API permissions<br />
          3. Store credentials in Azure Key Vault<br />
          4. Enter your App Service URL above
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ onQuickAction, isLive }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px",
        background: "linear-gradient(135deg, #1e40af, #3b82f6)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
        boxShadow: "0 8px 32px rgba(59,130,246,0.3)",
      }}>🛡️</div>
      <h2 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
        Intune Command Center
      </h2>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 8, lineHeight: 1.6, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
        Manage your Team 2 fleet. Deploy apps, push patches, check compliance, and monitor devices — all through natural language.
      </p>
      {!isLive && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", marginTop: 12,
          background: "#3b2e10", border: "1px solid #78350f", borderRadius: 99,
          color: "#fbbf24", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
        }}>⚠ Demo Mode — click ⚙️ to connect Azure</div>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 24, maxWidth: 420,
        marginLeft: "auto", marginRight: "auto",
      }}>
        <ActionCard icon="📦" title="Deploy an App" subtitle="Push software to devices" onClick={() => onQuickAction("Install Google Chrome on All Devices")} />
        <ActionCard icon="🔄" title="Push Updates" subtitle="Windows quality patches" onClick={() => onQuickAction("Push latest quality update to All Devices")} />
        <ActionCard icon="📊" title="Check Devices" subtitle="View fleet status" onClick={() => onQuickAction("Show me all device statuses")} />
        <ActionCard icon="🔒" title="Compliance" subtitle="View compliance report" onClick={() => onQuickAction("Show compliance status for all devices")} />
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 16, animation: "fadeSlideIn 0.3s ease" }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0, marginRight: 10, marginTop: 2,
          background: "linear-gradient(135deg, #1e40af, #3b82f6)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>🛡️</div>
      )}
      <div style={{ maxWidth: "85%" }}>
        <div style={{
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "linear-gradient(135deg, #1e40af, #2563eb)" : "#111827",
          border: isUser ? "none" : "1px solid #1e293b",
          color: "#e2e8f0", fontSize: 13, lineHeight: 1.6,
        }}>{message.text}</div>
        {message.component && <div style={{ marginTop: 6 }}>{message.component}</div>}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function IntuneChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [groups, setGroups] = useState(DEMO_GROUPS);
  const scrollRef = useRef(null);
  const apiRef = useRef(createApi(DEFAULT_API_URL, false));

  // Rebuild API client when settings change
  useEffect(() => {
    apiRef.current = createApi(apiUrl, isLive);
    if (isLive) {
      apiRef.current.getGroups().then(setGroups).catch(() => setGroups(DEMO_GROUPS));
    } else {
      setGroups(DEMO_GROUPS);
    }
  }, [apiUrl, isLive]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const addBot = useCallback((text, component = null) => {
    setMessages(prev => [...prev, { role: "bot", text, component }]);
  }, []);

  const resolveGroupId = useCallback((groupName) => {
    const g = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
    return g ? g.id : groups[0]?.id || "all-devices";
  }, [groups]);

  const processMessage = useCallback(async (userMessage) => {
    const intent = classifyIntent(userMessage);
    const app = findApp(userMessage);
    const groupName = findGroupName(userMessage);
    const lower = userMessage.toLowerCase();
    const api = apiRef.current;

    setIsTyping(true);

    try {
      if (!intent) {
        setIsTyping(false);
        addBot(
          "I can help you manage your Intune environment. Try asking me to:\n\n• Deploy an app (e.g. \"Install Chrome on All Devices\")\n• Push updates (e.g. \"Push quality update to Engineering Team\")\n• Check device status or compliance\n• Sync or restart a device\n• Create a configuration profile"
        );
        return;
      }

      switch (intent) {
        // ===========================================
        // APP DEPLOYMENT
        // ===========================================
        case "appDeployment": {
          if (app) {
            setIsTyping(false);
            const deployId = `app-${Date.now()}`;
            const DynamicDeployCard = () => {
              const [status, setStatus] = useState("idle");
              const handleDeploy = async () => {
                setStatus("deploying");
                try {
                  const groupId = resolveGroupId(groupName);
                  await api.deployApp(app.name, app.wingetId, groupId);
                  setStatus("deployed");
                } catch (e) {
                  setStatus("error");
                }
              };
              return (
                <DeployCard
                  title={app.name}
                  subtitle={`Type: ${app.type}  •  Size: ${app.size}  •  WinGet: ${app.wingetId}`}
                  meta={<>Target: <span style={{ color: "#60a5fa" }}>{groupName}</span></>}
                  gradient="#2563eb, #3b82f6"
                  onDeploy={handleDeploy}
                  status={status}
                />
              );
            };
            addBot(
              `I'll deploy ${app.name} to ${groupName} via Microsoft Graph API. Here's the deployment summary:`,
              <DynamicDeployCard />
            );
          } else {
            setIsTyping(false);
            addBot(
              `I can deploy apps to ${groupName}. Which application would you like to install?`,
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                {APP_CATALOG.slice(0, 6).map(a => (
                  <ActionCard key={a.name} icon="📦" title={a.name}
                    subtitle={`${a.type} • ${a.wingetId}`}
                    onClick={() => {
                      setMessages(prev => [...prev, { role: "user", text: `Install ${a.name} on ${groupName}` }]);
                      processMessage(`Install ${a.name} on ${groupName}`);
                    }}
                  />
                ))}
              </div>
            );
          }
          break;
        }

        // ===========================================
        // WINDOWS UPDATES
        // ===========================================
        case "updates": {
          let updateType = "Quality Update";
          if (lower.includes("feature")) updateType = "Feature Update";
          else if (lower.includes("driver")) updateType = "Driver Update";
          else if (lower.includes("expedit")) updateType = "Expedited Update";
          const icons = { "Quality Update": "🔒", "Feature Update": "⬆️", "Driver Update": "🖥️", "Expedited Update": "⚡" };

          setIsTyping(false);
          const DynamicUpdateCard = () => {
            const [status, setStatus] = useState("idle");
            const handleDeploy = async () => {
              setStatus("deploying");
              try {
                const groupId = resolveGroupId(groupName);
                if (updateType === "Feature Update") await api.pushFeatureUpdate(groupId);
                else await api.pushQualityUpdate(groupId);
                setStatus("deployed");
              } catch (e) { setStatus("error"); }
            };
            return (
              <DeployCard
                title={`${icons[updateType] || "📦"} ${updateType}`}
                subtitle={<>Target: <span style={{ color: "#60a5fa" }}>{groupName}</span></>}
                meta="Ring: Production  •  Deferral: 0 days"
                gradient="#7c3aed, #8b5cf6"
                onDeploy={handleDeploy}
                status={status}
              />
            );
          };
          addBot(
            `I'll configure a ${updateType} deployment for ${groupName} using the Windows Update for Business Graph API endpoint.`,
            <DynamicUpdateCard />
          );
          break;
        }

        // ===========================================
        // DEVICE MANAGEMENT
        // ===========================================
        case "devices": {
          if (lower.includes("sync")) {
            const devices = await api.getDevices();
            let synced = 0;
            for (const d of devices) {
              try { await api.syncDevice(d.id); synced++; } catch {}
            }
            setIsTyping(false);
            addBot(
              `Sync command sent to ${synced} devices in ${groupName} via POST /managedDevices/{id}/syncDevice.`,
              <InfoBox color="#60a5fa" borderColor="#1e3a5f" bg="#172554">
                ⟳ {synced} device{synced !== 1 ? "s" : ""} synced. Check-in results will appear within 15 minutes. Monitor via Devices → Monitor in the Intune portal.
              </InfoBox>
            );
          } else if (lower.includes("wipe") || lower.includes("retire")) {
            setIsTyping(false);
            addBot(
              "⚠️ Destructive actions require exact device confirmation. Please specify the exact device name (e.g. \"Wipe IVY-PC-001\"). Wipe = factory reset via /managedDevices/{id}/wipe. Retire = remove company data only via /managedDevices/{id}/retire."
            );
          } else if (lower.includes("restart") || lower.includes("reboot")) {
            const devices = await api.getDevices();
            let rebooted = 0;
            for (const d of devices) {
              try { await api.rebootDevice(d.id); rebooted++; } catch {}
            }
            setIsTyping(false);
            addBot(
              `Restart command sent to ${rebooted} devices in ${groupName} via POST /managedDevices/{id}/rebootNow.`,
              <InfoBox color="#fbbf24" borderColor="#78350f" bg="#3b2e10">
                ⏱ {rebooted} device{rebooted !== 1 ? "s" : ""} will restart within the next maintenance window. Users receive a 15-minute warning.
              </InfoBox>
            );
          } else {
            const devices = await api.getDevices();
            setIsTyping(false);
            const DeviceTableWithActions = () => {
              const [selected, setSelected] = useState([]);
              const [actionMsg, setActionMsg] = useState(null);
              const [busy, setBusy] = useState(false);
              const handleAction = async (id, name, action) => {
                try {
                  if (action === "sync") await api.syncDevice(id);
                  else if (action === "reboot") await api.rebootDevice(id);
                  setActionMsg({ ok: true, text: `${action === "sync" ? "Sync" : "Restart"} sent to ${name}` });
                } catch (e) {
                  setActionMsg({ ok: false, text: `Failed: ${e.message}` });
                }
                setTimeout(() => setActionMsg(null), 3000);
              };
              const bulkAction = async (actionFn, label) => {
                if (selected.length === 0) return;
                setBusy(true);
                let ok = 0, fail = 0;
                for (const id of selected) {
                  try { await actionFn(id); ok++; } catch { fail++; }
                }
                setBusy(false);
                setActionMsg({
                  ok: fail === 0,
                  text: `${label}: ${ok} succeeded${fail > 0 ? `, ${fail} failed` : ""} out of ${selected.length} device${selected.length !== 1 ? "s" : ""}`,
                });
                setTimeout(() => setActionMsg(null), 5000);
              };
              const confirmDestructive = (action, fn) => {
                const names = devices.filter(d => selected.includes(d.id)).map(d => d.name).join(", ");
                if (window.confirm(`⚠️ ${action} ${selected.length} device${selected.length !== 1 ? "s" : ""}?\n\n${names}\n\nThis cannot be undone.`)) {
                  bulkAction(fn, action);
                }
              };
              return (
                <div>
                  <DeviceTable devices={devices} onAction={handleAction}
                    selectable={true} selected={selected} onSelect={setSelected} />
                  {selected.length > 0 && (
                    <BulkActionBar
                      count={selected.length}
                      busy={busy}
                      onSync={() => bulkAction(api.syncDevice, "Sync")}
                      onReboot={() => confirmDestructive("Restart", api.rebootDevice)}
                      onRetire={() => confirmDestructive("Retire", api.retireDevice)}
                      onWipe={() => confirmDestructive("Wipe", api.wipeDevice)}
                      onClear={() => setSelected([])}
                    />
                  )}
                  {actionMsg && (
                    <InfoBox
                      color={actionMsg.ok ? "#34d399" : "#f87171"}
                      borderColor={actionMsg.ok ? "#166534" : "#7f1d1d"}
                      bg={actionMsg.ok ? "#0d3320" : "#3b1118"}
                    >{actionMsg.text}</InfoBox>
                  )}
                </div>
              );
            };
            addBot(
              `${isLive ? "Live" : "Demo"} device inventory — ${devices.length} enrolled devices. Select individual devices or use the checkbox to select all:`,
              <DeviceTableWithActions />
            );
          }
          break;
        }

        // ===========================================
        // COMPLIANCE
        // ===========================================
        case "compliance": {
          const data = await api.getCompliance();
          const summary = data.summary;
          const devices = (data.devices || []).map(d => ({
            ...d,
            status: normalizeStatus(d.status || d.complianceState),
            lastSync: d.lastSync || timeAgo(d.lastSyncDateTime),
          }));
          const nonCompliantNames = devices.filter(d => d.status === "Non-Compliant").map(d => d.name || d.deviceName).join(", ");
          setIsTyping(false);
          const ComplianceView = () => {
            const [selected, setSelected] = useState([]);
            const [actionMsg, setActionMsg] = useState(null);
            const [busy, setBusy] = useState(false);
            const bulkSync = async () => {
              if (selected.length === 0) return;
              setBusy(true);
              let ok = 0;
              for (const id of selected) {
                try { await api.syncDevice(id); ok++; } catch {}
              }
              setBusy(false);
              setActionMsg({ ok: true, text: `Sync sent to ${ok} of ${selected.length} selected device${selected.length !== 1 ? "s" : ""}` });
              setTimeout(() => setActionMsg(null), 5000);
            };
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                  {[
                    { label: "Compliant", count: summary.compliant, color: "#34d399", bg: "#0d3320" },
                    { label: "Non-Compliant", count: summary.noncompliant, color: "#f87171", bg: "#3b1118" },
                    { label: "Grace Period", count: summary.inGracePeriod, color: "#fbbf24", bg: "#3b2e10" },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.count}</div>
                      <div style={{ fontSize: 11, color: s.color, opacity: 0.8, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <DeviceTable devices={devices} selectable={true} selected={selected} onSelect={setSelected} />
                {selected.length > 0 && (
                  <BulkActionBar
                    count={selected.length}
                    busy={busy}
                    onSync={bulkSync}
                    onReboot={() => {}}
                    onRetire={() => {}}
                    onWipe={() => {}}
                    onClear={() => setSelected([])}
                  />
                )}
                {actionMsg && (
                  <InfoBox color={actionMsg.ok ? "#34d399" : "#f87171"} borderColor={actionMsg.ok ? "#166534" : "#7f1d1d"} bg={actionMsg.ok ? "#0d3320" : "#3b1118"}>
                    {actionMsg.text}
                  </InfoBox>
                )}
                {nonCompliantNames && (
                  <InfoBox color="#94a3b8" borderColor="#1e293b" bg="#0f1a2e">
                    💡 Non-compliant: {nonCompliantNames}. Select them above and hit Sync to push a check-in.
                  </InfoBox>
                )}
              </div>
            );
          };
          addBot(`Compliance overview — select devices to take action:`, <ComplianceView />);
          break;
        }

        // ===========================================
        // DASHBOARD / MONITOR
        // ===========================================
        case "monitor": {
          const devices = await api.getDevices();
          const compliance = await api.getCompliance();
          const total = devices.length;
          const nonCompliant = compliance.summary.noncompliant;
          setIsTyping(false);
          addBot(
            `${isLive ? "Live" : "Demo"} Intune dashboard from Microsoft Graph API:`,
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                {[
                  { label: "Enrolled Devices", value: total, icon: "💻", color: "#60a5fa" },
                  { label: "Non-Compliant", value: nonCompliant, icon: "⚠️", color: nonCompliant > 0 ? "#f87171" : "#34d399" },
                  { label: "Compliant", value: compliance.summary.compliant, icon: "✅", color: "#34d399" },
                  { label: "Grace Period", value: compliance.summary.inGracePeriod, icon: "⏳", color: "#fbbf24" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "#0f1a2e", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <InfoBox color="#94a3b8" borderColor="#1e293b" bg="#0f1a2e">
                🏥 Service Health: {isLive ? "Connected to live tenant" : "Demo mode"} • Tenant: ivystravelers.onmicrosoft.com
              </InfoBox>
            </div>
          );
          break;
        }

        // ===========================================
        // CONFIGURATION PROFILES
        // ===========================================
        case "config": {
          if (lower.includes("date") || lower.includes("time") || lower.includes("region")) {
            setIsTyping(false);
            const DynamicConfigCard = () => {
              const [status, setStatus] = useState("idle");
              const handleDeploy = async () => {
                setStatus("deploying");
                try {
                  const groupId = resolveGroupId("All Users");
                  await api.createConfigProfile("Date Time Region - Team 2", [], groupId);
                  setStatus("deployed");
                } catch (e) { setStatus("error"); }
              };
              return (
                <div style={{ background: "#0f1a2e", border: "1px solid #1e293b", borderRadius: 12, padding: 18, marginTop: 8 }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>📋 Configuration Profile</div>
                  <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", lineHeight: 1.8 }}>
                    <div><span style={{ color: "#64748b" }}>Platform:</span> Windows 10/11</div>
                    <div><span style={{ color: "#64748b" }}>Profile Type:</span> Settings Catalog</div>
                    <div><span style={{ color: "#64748b" }}>Allow Date/Time:</span> <span style={{ color: "#34d399" }}>Enabled</span></div>
                    <div><span style={{ color: "#64748b" }}>Allow Region:</span> <span style={{ color: "#34d399" }}>Enabled</span></div>
                    <div><span style={{ color: "#64748b" }}>Assignment:</span> All Users & Devices</div>
                    <div><span style={{ color: "#64748b" }}>API Endpoint:</span> <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#60a5fa" }}>POST /configurationPolicies</span></div>
                  </div>
                  {status === "idle" && (
                    <button onClick={handleDeploy} style={{
                      marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
                      fontWeight: 600, fontSize: 13, cursor: "pointer",
                      background: "linear-gradient(135deg, #0d9488, #14b8a6)", color: "#fff",
                    }}>🚀 Create & Assign Profile</button>
                  )}
                  {status === "deploying" && <div style={{ marginTop: 14, textAlign: "center", color: "#64748b", fontSize: 13 }}>⏳ Creating profile...</div>}
                  {status === "deployed" && (
                    <InfoBox color="#34d399" borderColor="#166534" bg="#0d3320">
                      ✓ Profile created and assigned via Graph API. Devices will apply settings on next sync.
                    </InfoBox>
                  )}
                  {status === "error" && (
                    <InfoBox color="#f87171" borderColor="#7f1d1d" bg="#3b1118">
                      ✗ Failed to create profile. Check API permissions.
                    </InfoBox>
                  )}
                </div>
              );
            };
            addBot(
              "Based on Team 2' travel policy, I'll create a Date, Time & Region configuration profile via POST /deviceManagement/configurationPolicies.",
              <DynamicConfigCard />
            );
          } else {
            setIsTyping(false);
            addBot(
              "I can create configuration profiles via the Settings Catalog API. What would you like to configure? Options include: Date/Time/Region settings, Wi-Fi profiles, VPN, Email, Device restrictions, Endpoint protection."
            );
          }
          break;
        }

        default: {
          setIsTyping(false);
          addBot("I'm not sure how to handle that. Try asking me to deploy an app, push an update, check compliance, or monitor devices.");
        }
      }
    } catch (err) {
      setIsTyping(false);
      addBot(
        `❌ Error: ${err.message}`,
        <InfoBox color="#f87171" borderColor="#7f1d1d" bg="#3b1118">
          API call failed. {isLive ? "Check your Azure backend connection and Graph API permissions." : "Unexpected error in demo mode."}
        </InfoBox>
      );
    }
  }, [addBot, isLive, groups, resolveGroupId]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;
    setMessages(prev => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    processMessage(trimmed);
  }, [input, isTyping, processMessage]);

  const handleQuickAction = useCallback((text) => {
    setMessages(prev => [...prev, { role: "user", text }]);
    processMessage(text);
  }, [processMessage]);

  const testConnection = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: true, service: data.service || "Connected" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [apiUrl]);

  return (
    <div style={{
      width: "100%", maxWidth: 640, height: "100vh", maxHeight: 800,
      margin: "0 auto", display: "flex", flexDirection: "column",
      background: "#080e1a", fontFamily: "'Instrument Sans', 'SF Pro Display', -apple-system, sans-serif",
      overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-6px); opacity: 1; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
      `}</style>

      {showSettings && (
        <SettingsPanel apiUrl={apiUrl} setApiUrl={setApiUrl} isLive={isLive} setIsLive={setIsLive}
          onClose={() => setShowSettings(false)} onTest={testConnection} />
      )}

      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b", background: "linear-gradient(180deg, #0c1524 0%, #080e1a 100%)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #1e40af, #3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              boxShadow: "0 4px 16px rgba(59,130,246,0.3)",
            }}>🛡️</div>
            <div>
              <div style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Intune Command Center</div>
              <div style={{ color: "#3b82f6", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                Team 2 • CloudGuard Consulting
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} title="Back to Home"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid #1e293b",
                  background: "#0f1a2e", color: "#94a3b8", cursor: "pointer", fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.background = "#1a2744"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "#0f1a2e"; }}
              >⌂</button>
            )}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              background: isLive ? "#0d3320" : "#3b2e10", borderRadius: 99,
              border: `1px solid ${isLive ? "#166534" : "#78350f"}`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: isLive ? "#34d399" : "#fbbf24" }} />
              <span style={{ color: isLive ? "#34d399" : "#fbbf24", fontSize: 10, fontWeight: 600 }}>
                {isLive ? "LIVE" : "DEMO"}
              </span>
            </div>
            <button onClick={() => setShowSettings(true)} style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid #1e293b",
              background: "#0f1a2e", color: "#94a3b8", cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.background = "#1a2744"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "#0f1a2e"; }}
            >⚙️</button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {messages.length === 0 ? (
          <WelcomeScreen onQuickAction={handleQuickAction} isLive={isLive} />
        ) : (
          <>
            {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
            {isTyping && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                  background: "linear-gradient(135deg, #1e40af, #3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}>🛡️</div>
                <div style={{ padding: "8px 16px", background: "#111827", border: "1px solid #1e293b", borderRadius: "16px 16px 16px 4px" }}>
                  <TypingIndicator />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Suggestions */}
      {messages.length > 0 && messages.length < 3 && (
        <div style={{ padding: "0 20px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Deploy Slack to Remote Workers", "Show compliance", "Push quality update", "Sync all devices"].map(s => (
            <button key={s} onClick={() => handleQuickAction(s)}
              style={{
                padding: "6px 12px", borderRadius: 99, border: "1px solid #1e293b",
                background: "#0f1a2e", color: "#94a3b8", fontSize: 11, cursor: "pointer",
                transition: "all 0.2s", fontWeight: 500,
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.color = "#e2e8f0"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#1e293b"; e.target.style.color = "#94a3b8"; }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #1e293b", background: "#0c1524", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Deploy Chrome to all PCs, push latest update, check compliance..."
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid #1e293b",
              background: "#111827", color: "#e2e8f0", fontSize: 13, outline: "none",
              fontFamily: "inherit", transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "#3b82f6"}
            onBlur={e => e.target.style.borderColor = "#1e293b"}
          />
          <button onClick={handleSend} disabled={!input.trim() || isTyping}
            style={{
              width: 44, height: 44, borderRadius: 12, border: "none",
              background: input.trim() && !isTyping ? "linear-gradient(135deg, #1e40af, #3b82f6)" : "#1e293b",
              color: input.trim() && !isTyping ? "#fff" : "#64748b",
              fontSize: 18, cursor: input.trim() && !isTyping ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", flexShrink: 0,
            }}>↑</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, color: "#334155", fontSize: 10, letterSpacing: 0.3 }}>
          {isLive ? `Connected to ${apiUrl}` : "Demo mode — click ⚙️ to connect your Azure backend"}
        </div>
      </div>
    </div>
  );
}
