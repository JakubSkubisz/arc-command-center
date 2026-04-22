import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// CONFIGURATION — Set your Azure App Service backend URL here
// ============================================================
const DEFAULT_API_URL = "https://intune-command-center.azurewebsites.net/api";

// WinGet package identifiers for common apps
const APP_CATALOG = [
  { name: "Google Chrome", wingetId: "Google.Chrome", type: "Win32", size: "120 MB", aliases: ["chrome", "google chrome"] },
  { name: "Mozilla Firefox", wingetId: "Mozilla.Firefox", type: "Win32", size: "95 MB", aliases: ["firefox", "mozilla firefox"] },
  { name: "Zoom Workplace", wingetId: "Zoom.Zoom", type: "Store", size: "45 MB", aliases: ["zoom", "zoom workplace"] },
  { name: "Slack", wingetId: "SlackTechnologies.Slack", type: "Store", size: "78 MB", aliases: ["slack"] },
  { name: "Adobe Acrobat Reader", wingetId: "Adobe.Acrobat.Reader.64-bit", type: "Win32", size: "210 MB", aliases: ["acrobat", "adobe reader", "pdf reader", "adobe acrobat"] },
  { name: "Microsoft Teams", wingetId: "Microsoft.Teams", type: "M365", size: "Bundled", aliases: ["teams", "microsoft teams"] },
  { name: "7-Zip", wingetId: "7zip.7zip", type: "Win32", size: "5 MB", aliases: ["7zip", "7-zip", "zip"] },
  { name: "Visual Studio Code", wingetId: "Microsoft.VisualStudioCode", type: "Win32", size: "95 MB", aliases: ["vscode", "vs code", "code", "visual studio code"] },
  { name: "Notepad++", wingetId: "Notepad++.Notepad++", type: "Win32", size: "12 MB", aliases: ["notepad++", "notepad", "npp"] },
  { name: "VLC Media Player", wingetId: "VideoLAN.VLC", type: "Win32", size: "42 MB", aliases: ["vlc", "vlc player", "vlc media player"] },
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
  devices: ["device", "pc", "computer", "laptop", "enroll", "wipe", "retire", "restart", "sync", "reboot", "ivy-"],
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
  return APP_CATALOG.find(a => {
    // Check if message contains the full app name
    if (lower.includes(a.name.toLowerCase())) return true;
    // Check if message contains any of the app's aliases
    if (a.aliases && a.aliases.length > 0) {
      return a.aliases.some(alias => lower.includes(alias.toLowerCase()));
    }
    return false;
  });
}

function findGroupName(msg) {
  const lower = msg.toLowerCase();
  const g = DEMO_GROUPS.find(g => lower.includes(g.name.toLowerCase()));
  return g ? g.name : "All Devices";
}

function findDeviceNames(msg, devices) {
  const lower = msg.toLowerCase();
  return devices.filter(d => {
    if (d.name && lower.includes(d.name.toLowerCase())) return true;
    if (d.user && lower.includes(d.user.toLowerCase())) return true;
    if (d.user) {
      const parts = d.user.toLowerCase().split(/\s+/);
      if (parts.some(part => part.length > 2 && lower.includes(part + "'s"))) return true;
    }
    return false;
  });
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
    // Machines
    async getDevices() {
      if (!isLive) return DEMO_DEVICES;
      const data = await call("GET", "/devices");
      return data.map(d => ({
        id: d.id,
        name: d.name,
        user: d.user || "—",
        os: d.os,
        status: d.status === "Connected" ? "Connected" : d.status === "Disconnected" ? "Disconnected" : "Error",
        lastSync: timeAgo(d.lastSync),
      }));
    },

    async syncDevice(machineName) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${machineName}/run-command`, { script: "& 'C:\\Program Files\\AzureConnectedMachineAgent\\azcmagent.exe' check", location: "eastus" });
    },

    async rebootDevice(machineName) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${machineName}/run-command`, { script: "Restart-Computer -Force", type: "PowerShell" });
    },

    async wipeDevice(machineName) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${machineName}/run-command`, { script: "Reset-Computer -ResetType FactoryReset -Force", type: "PowerShell" });
    },

    async retireDevice(machineName) {
      if (!isLive) return { success: true };
      return call("POST", `/devices/${machineName}/run-command`, { script: "azcmagent disconnect --force-local-only", type: "PowerShell" });
    },

    // Apps — deploy via WinGet extension per machine
    async deployApp(displayName, packageId, machineName) {
      if (!isLive) return { success: true, appId: "demo-" + Date.now() };
      return call("POST", "/apps/deploy-winget", { machineName, packageId });
    },

    async pollDeployStatus(machineName, packageId, onStatus, signal) {
      if (!isLive) return "Succeeded";
      const runCommandName = `WinGet-${packageId.replace(/\./g, "-")}`;
      while (!signal?.aborted) {
        await new Promise(r => setTimeout(r, 5000));
        if (signal?.aborted) break;
        try {
          const data = await call("GET", `/apps/${machineName}/${runCommandName}/status`);
          onStatus(data);
          const state = data.executionState || data.provisioningState;
          if (state === "Succeeded" || state === "Failed" || state === "Canceled") return state;
        } catch {
          // keep polling on transient errors
        }
      }
    },

    // Updates — Arc patch management per machine
    async pushUpdate(machineName) {
      if (!isLive) return { success: true, profileId: "demo-update-" + Date.now() };
      return call("POST", "/updates/install", { machineName });
    },

    async assessPatches(machineName) {
      if (!isLive) return { success: true };
      return call("POST", "/updates/assess", { machineName });
    },

    // Compliance — map Arc connected/disconnected to compliant/noncompliant
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
      const data = await call("GET", "/compliance");
      return {
        summary: {
          compliant: data.summary.connected || 0,
          noncompliant: (data.summary.disconnected || 0) + (data.summary.error || 0),
          inGracePeriod: 0,
        },
        devices: (data.devices || []).map(d => ({
          ...d,
          status: d.status === "Connected" ? "Connected" : d.status === "Disconnected" ? "Disconnected" : "Error",
          lastSync: timeAgo(d.lastSync),
        })),
      };
    },

    // Config — deploy a run-command extension to each target machine
    async createConfigProfile(displayName, script, machineNames) {
      if (!isLive) return { success: true, profileId: "demo-cfg-" + Date.now() };
      const targets = Array.isArray(machineNames) ? machineNames : [machineNames];
      for (const machineName of targets) {
        await call("PUT", "/config/extension", {
          machineName,
          extensionName: displayName.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 24),
          publisher: "Microsoft.CPlat.Core",
          type: "RunCommandHandlerWindows",
          version: "1.2",
          settings: { script: Array.isArray(script) ? script : [script] },
        });
      }
      return { success: true, count: targets.length };
    },

    // Health
    async checkHealth() {
      if (!isLive) return { status: "ok", service: "Demo Mode" };
      return call("GET", "/health");
    },
  };
}

// ============================================================
// HELPERS
// ============================================================
function demoDelay(isLive, ms = 700) {
  if (isLive) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
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
    Connected: { bg: "#0d3320", text: "#34d399", border: "#166534" },
    "Non-Compliant": { bg: "#3b1118", text: "#f87171", border: "#7f1d1d" },
    Disconnected: { bg: "#3b1118", text: "#f87171", border: "#7f1d1d" },
    "In Grace Period": { bg: "#3b2e10", text: "#fbbf24", border: "#78350f" },
    Pending: { bg: "#1e293b", text: "#94a3b8", border: "#334155" },
    Deployed: { bg: "#0d3320", text: "#34d399", border: "#166534" },
    Queued: { bg: "#2a2416", text: "#d4a574", border: "#4a3a1a" },
    Error: { bg: "#3b1118", text: "#f87171", border: "#7f1d1d" },
  };
  const c = colors[status] || colors.Pending;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 3,
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
        background: "#0c1524",
        border: `1px solid ${hovered ? "#2a3f5f" : "#1a2740"}`,
        borderRadius: 4, padding: "12px 14px", cursor: "pointer", textAlign: "left",
        transition: "all 0.15s ease",
        width: "100%",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
    </button>
  );
}

function InfoBox({ color, borderColor, bg, children }) {
  return (
    <div style={{
      marginTop: 8, padding: "12px 16px",
      background: bg,
      border: `1px solid ${borderColor}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 3, color, fontSize: 12, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

function StepProgress({ steps, gradient }) {
  const accent = gradient ? gradient.split(",")[0].trim() : "#c9a227";
  return (
    <div style={{ marginTop: 14, padding: "2px 0" }}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const cfg = {
          pending: { bg: "transparent", border: "#334155", icon: null, textColor: "#475569" },
          active:  { bg: accent, border: accent, icon: "...", textColor: "#e2e8f0" },
          done:    { bg: "#059669", border: "#059669", icon: "\u2713", textColor: "#34d399" },
          error:   { bg: "#dc2626", border: "#dc2626", icon: "\u2717", textColor: "#f87171" },
        }[step.status] || { bg: "transparent", border: "#334155", icon: null, textColor: "#475569" };
        return (
          <div key={step.key || i} style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: 12, flexShrink: 0 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: step.status === "pending" ? "rgba(15,26,46,0.8)" : cfg.bg,
                border: `2px solid ${cfg.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "#fff",
                transition: "all 0.3s ease",
              }}>{cfg.icon}</div>
              {!isLast && (
                <div style={{
                  width: 2, minHeight: 20, flex: 1,
                  background: step.status === "done" ? "#059669" : "#1e293b",
                  transition: "background 0.3s ease",
                }} />
              )}
            </div>
            <div style={{
              flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingBottom: isLast ? 0 : 14, minHeight: 32,
            }}>
              <span style={{
                fontSize: 12, fontWeight: step.status === "active" ? 600 : 400,
                color: cfg.textColor, transition: "all 0.3s ease",
              }}>{step.label}</span>
              {step.timestamp && (
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#475569", marginLeft: 12 }}>
                  {step.timestamp}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LiveActionTracker({ actionLabel, deviceStates, totalCount, completedCount }) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = completedCount === totalCount;
  return (
    <div style={{
      marginTop: 10,
      background: "#0c1524",
      border: "1px solid #1a2740",
      borderRadius: 4, padding: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{actionLabel} Progress</span>
        <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          {completedCount}/{totalCount} ({pct}%)
        </span>
      </div>
      <div style={{ width: "100%", height: 6, background: "#1e293b", borderRadius: 99, overflow: "hidden", position: "relative" }}>
        <div style={{
          height: "100%", borderRadius: 99,
          background: allDone
            ? "linear-gradient(90deg, #059669, #34d399)"
            : "linear-gradient(90deg, #a67c00, #c9a227)",
          width: `${pct}%`, transition: "width 0.4s ease",
          position: "relative", overflow: "hidden",
        }}>

        </div>
      </div>
      <div style={{ marginTop: 12, maxHeight: 200, overflowY: "auto" }}>
        {deviceStates.map(d => (
          <div key={d.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 0", borderBottom: "1px solid #111827",
          }}>
            <span style={{
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              color: d.status === "success" ? "#34d399" : d.status === "error" ? "#f87171" : d.status === "processing" ? "#e2e8f0" : "#475569",
              fontWeight: d.status === "processing" ? 600 : 400,
            }}>{d.name}</span>
            <span style={{ fontSize: 11, minWidth: 24, textAlign: "right" }}>
              {d.status === "pending" && <span style={{ color: "#334155" }}>--</span>}
              {d.status === "processing" && <span style={{ color: "#d4a574", animation: "typingBounce 1s infinite" }}>...</span>}
              {d.status === "success" && <span style={{ color: "#34d399" }}>{"\u2713"}</span>}
              {d.status === "error" && <span style={{ color: "#f87171" }}>{"\u2717"}</span>}
            </span>
          </div>
        ))}
      </div>
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
    background: checked ? "#a67c00" : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all 0.15s ease",
  });

  return (
    <div style={{ overflowX: "auto", borderRadius: 4, border: "1px solid rgba(30,41,59,0.5)", marginTop: 8 }}>
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
                  borderBottom: "1px solid rgba(30,41,59,0.4)", cursor: selectable ? "pointer" : "default",
                  background: isChecked ? "rgba(15,29,58,0.8)" : "transparent",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = "rgba(15,26,46,0.5)"; }}
                onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = "transparent"; }}
              >
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
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(201,162,39,0.4)"; e.currentTarget.style.color = "#d4a574"; e.currentTarget.style.boxShadow = "0 0 12px rgba(201,162,39,0.12)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(30,41,59,0.5)"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.boxShadow = "none"; }}
                          style={{
                            width: 28, height: 28, borderRadius: 3,
                            border: "1px solid rgba(30,41,59,0.5)",
                            background: "#0c1524",
                            color: "#94a3b8", cursor: "pointer", fontSize: 13,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.2s ease",
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
    padding: "7px 14px", borderRadius: 8, border: "1px solid transparent", fontWeight: 600,
    fontSize: 12, cursor: busy ? "not-allowed" : "pointer", transition: "all 0.2s",
    opacity: busy ? 0.5 : 1, display: "flex", alignItems: "center", gap: 5,
  };
  return (
    <div style={{
      marginTop: 10, padding: "12px 16px",
      background: "#0c1524",
      border: "1px solid rgba(201,162,39,0.25)", borderRadius: 3,
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
      animation: "fadeSlideIn 0.2s ease",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          background: "#a67c00", color: "#fff",
          borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
        }}>{count}</span>
        device{count !== 1 ? "s" : ""} selected
        <button onClick={onClear} style={{
          background: "none", border: "none", color: "#64748b", cursor: "pointer",
          fontSize: 11, textDecoration: "underline",
        }}>Clear</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={onSync} disabled={busy} style={{ ...btnBase, background: "#2a2416", color: "#d4a574" }}>
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

function TargetSelector({ devices, preSelected, onConfirm, actionLabel, gradient }) {
  const [mode, setMode] = useState(preSelected && preSelected.length > 0 && preSelected.length < devices.length ? "specific" : "all");
  const [selected, setSelected] = useState(
    mode === "all" ? devices.map(d => d.id) : (preSelected || []).map(d => d.id)
  );
  const [confirmed, setConfirmed] = useState(false);

  const handleModeToggle = (newMode) => {
    setMode(newMode);
    if (newMode === "all") setSelected(devices.map(d => d.id));
    else setSelected((preSelected || []).map(d => d.id));
  };

  const handleConfirm = () => {
    const selectedDevices = devices.filter(d => selected.includes(d.id));
    setConfirmed(true);
    onConfirm(selectedDevices, mode === "all");
  };

  const accent = gradient ? gradient.split(",")[0].trim() : "#c9a227";

  if (confirmed) {
    const isAll = mode === "all";
    return (
      <div style={{
        marginTop: 8, padding: "10px 16px",
        background: "#0c1524",
        border: "1px solid #1a2740",
        borderRadius: 4,
        display: "flex", alignItems: "center", gap: 8,
        animation: "fadeSlideIn 0.3s ease",
      }}>
        <span style={{ color: accent, fontSize: 14 }}>✓</span>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          Targeting: {isAll ? (
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>All Devices ({devices.length})</span>
          ) : (
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{selected.length} device{selected.length !== 1 ? "s" : ""}</span>
          )}
          {!isAll && selected.length <= 3 && (
            <span style={{ color: "#64748b", marginLeft: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              ({devices.filter(d => selected.includes(d.id)).map(d => d.name).join(", ")})
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 8,
      background: "#0c1524",
      border: "1px solid #1a2740",
      borderRadius: 4, padding: 16,
      animation: "fadeSlideIn 0.3s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, color: "#475569" }}>Select target devices</span>
          <span style={{
            background: accent, color: "#fff", borderRadius: 6,
            padding: "2px 8px", fontSize: 11, fontWeight: 700,
          }}>{selected.length}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[{ key: "all", label: "All Devices" }, { key: "specific", label: "Select Specific" }].map(opt => (
          <button key={opt.key} onClick={() => handleModeToggle(opt.key)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${mode === opt.key ? accent + "80" : "rgba(30,41,59,0.5)"}`,
            background: mode === opt.key ? accent + "20" : "rgba(15,26,46,0.5)",
            color: mode === opt.key ? "#e2e8f0" : "#64748b",
            transition: "all 0.2s ease",
          }}>{opt.label}</button>
        ))}
      </div>

      {mode === "specific" && (
        <DeviceTable devices={devices} selectable={true} selected={selected} onSelect={setSelected} />
      )}

      <button onClick={handleConfirm} disabled={selected.length === 0} style={{
        marginTop: 12, width: "100%", padding: "10px 0", borderRadius: 3, border: "none",
        fontWeight: 600, fontSize: 13, cursor: selected.length > 0 ? "pointer" : "not-allowed",
        background: selected.length > 0 ? accent : "#1e293b",
        color: selected.length > 0 ? "#fff" : "#475569",
        transition: "all 0.15s", letterSpacing: 0.3,
        opacity: selected.length === 0 ? 0.5 : 1,
      }}>
        <span style={{ position: "relative", zIndex: 1 }}>
          {actionLabel ? `Confirm Targets & ${actionLabel}` : "Confirm Targets"} ({selected.length} device{selected.length !== 1 ? "s" : ""})
        </span>
      </button>
    </div>
  );
}

function DeployCard({ title, subtitle, meta, gradient, onDeploy, status, steps }) {
  return (
    <div style={{
      background: "#0c1524",
      border: "1px solid #1a2740",
      borderRadius: 4, padding: 18, marginTop: 8,
    }}>
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
          marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 3, border: "none",
          fontWeight: 600, fontSize: 13, cursor: "pointer",
          background: (gradient || "#c9a227").split(",")[0].trim(), color: "#fff",
          transition: "all 0.15s", letterSpacing: 0.3,
        }}>
          Confirm & Deploy
        </button>
      )}
      {status === "deploying" && (
        steps && steps.length > 0
          ? <StepProgress steps={steps} gradient={gradient} />
          : <div style={{ marginTop: 14, padding: "10px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
              <span style={{ animation: "typingBounce 1s infinite" }}>...</span> Calling Azure ARM API...
            </div>
      )}
      {status === "deployed" && (
        <div>
          {steps && steps.length > 0 && <StepProgress steps={steps} gradient={gradient} />}
          <InfoBox color="#34d399" borderColor="#166534" bg="#0d3320">
            Deployment successful. Devices will apply changes on next sync cycle.
          </InfoBox>
        </div>
      )}
      {status === "error" && (
        <div>
          {steps && steps.length > 0 && <StepProgress steps={steps} gradient={gradient} />}
          <InfoBox color="#f87171" borderColor="#7f1d1d" bg="#3b1118">
            Deployment failed. Check API connection and permissions.
          </InfoBox>
        </div>
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
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.7)",
      zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#0c1524",
        border: "1px solid rgba(30,41,59,0.5)",
        borderRadius: 4, padding: 24, width: "100%", maxWidth: 440,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 700 }}>⚙️ Connection Settings</div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer",
            transition: "all 0.2s", lineHeight: 1,
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.transform = "scale(1.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.transform = "scale(1)"; }}
          >×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Mode
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {[{ label: "Demo", value: false, desc: "Simulated data" }, { label: "Live", value: true, desc: "Azure backend" }].map(m => (
              <button key={m.label} onClick={() => setIsLive(m.value)} style={{
                flex: 1, padding: "10px 14px", borderRadius: 3, cursor: "pointer",
                background: isLive === m.value ? "#2a2416" : "#0f1a2e",
                border: `1px solid ${isLive === m.value ? "rgba(201,162,39,0.45)" : "rgba(30,41,59,0.5)"}`,
                color: isLive === m.value ? "#d4a574" : "#64748b", textAlign: "center",
                transition: "all 0.15s ease",
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
              width: "100%", padding: "10px 14px", borderRadius: 3, marginTop: 6,
              border: "1px solid #1e293b", background: "#111827", color: "#e2e8f0",
              fontSize: 13, outline: "none", fontFamily: "'JetBrains Mono', monospace",
            }} />
        </div>

        {isLive && (
          <button onClick={runTest} disabled={testing} style={{
            width: "100%", padding: "10px 0", borderRadius: 3, border: "1px solid #1e293b",
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

        <div style={{ marginTop: 16, padding: "12px 14px", background: "#0f1a2e", border: "1px solid #1e293b", borderRadius: 3, color: "#64748b", fontSize: 11, lineHeight: 1.6 }}>
          <strong style={{ color: "#94a3b8" }}>Setup required for Live mode:</strong><br />
          1. Deploy the Node.js backend to Azure App Service<br />
          2. Register an Entra ID app with ARM permissions (Azure Connected Machine Contributor)<br />
          3. Set CLIENT_ID, TENANT_ID, CLIENT_SECRET, AZURE_SUBSCRIPTION_ID in App Service config<br />
          4. Enter your App Service URL above
        </div>
      </div>
    </div>
  );
}

const DEPLOYABLE_APPS = APP_CATALOG.filter(a => [
  "Google.Chrome", "Mozilla.Firefox", "7zip.7zip", "Microsoft.VisualStudioCode",
  "VideoLAN.VLC", "Adobe.Acrobat.Reader.64-bit", "Zoom.Zoom",
].includes(a.wingetId));

function DeployAppCard({ onQuickAction }) {
  const [selected, setSelected] = useState("");
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{
      background: "#0c1524", border: `1px solid ${hovered ? "#2a3f5f" : "#1a2740"}`,
      borderRadius: 4, padding: "12px 14px", textAlign: "left", transition: "all 0.15s ease",
    }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>📦</span>
        <div>
          <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>Deploy an App</div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>Push software to devices</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            flex: 1, background: "#0a1120", border: "1px solid #1e3050", borderRadius: 3,
            color: selected ? "#e2e8f0" : "#64748b", fontSize: 12, padding: "5px 8px",
            outline: "none", cursor: "pointer",
          }}
        >
          <option value="" disabled>Select application...</option>
          {DEPLOYABLE_APPS.map(a => (
            <option key={a.wingetId} value={a.wingetId}>{a.name}</option>
          ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => {
            const app = DEPLOYABLE_APPS.find(a => a.wingetId === selected);
            if (app) onQuickAction(`Install ${app.name} on All Devices`);
          }}
          style={{
            background: selected ? "#c9a227" : "#1a2740", border: "none", borderRadius: 3,
            color: selected ? "#0a0e1a" : "#374151", fontSize: 12, fontWeight: 600,
            padding: "5px 12px", cursor: selected ? "pointer" : "default", transition: "all 0.15s",
          }}
        >
          Deploy
        </button>
      </div>
    </div>
  );
}

function WelcomeScreen({ onQuickAction, isLive }) {
  return (
    <div style={{ padding: "40px 0", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "flex-start", minHeight: "100%" }}>
      <h2 style={{
        fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.5,
        color: "#e2e8f0",
      }}>
        Arc Command Center
      </h2>
      <p style={{ color: "#7c8db5", fontSize: 14, marginTop: 10, lineHeight: 1.7, maxWidth: 480 }}>
        Manage your Team 2 Arc fleet. Deploy apps via WinGet, push patches, check machine health, and run commands — all through natural language.
      </p>
      {!isLive && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", marginTop: 12,
          background: "rgba(59,46,16,0.6)", border: "1px solid #78350f", borderRadius: 3,
          color: "#fbbf24", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
        }}>Demo Mode — click settings to connect Azure Arc</div>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 8, marginTop: 28, width: "100%",
      }}>
        <DeployAppCard onQuickAction={onQuickAction} />
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
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12, animation: "fadeSlideIn 0.3s ease" }}>
      <div style={{ maxWidth: "90%" }}>
        <div style={{
          padding: "10px 14px",
          borderRadius: 0,
          background: "transparent",
          borderLeft: isUser ? "2px solid #334155" : "none",
          color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-line",
          fontWeight: isUser ? 500 : 400,
        }}>{message.text}</div>
        {message.component && (
          <div style={{ marginTop: 8 }}>
            {message.component}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ArcChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [groups, setGroups] = useState(DEMO_GROUPS);
  const [deviceList, setDeviceList] = useState(DEMO_DEVICES);
  const scrollRef = useRef(null);
  const apiRef = useRef(createApi(DEFAULT_API_URL, false));

  const updateDeviceStatus = useCallback((id, updates) => {
    setDeviceList(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const removeDevices = useCallback((ids) => {
    setDeviceList(prev => prev.filter(d => !ids.includes(d.id)));
  }, []);

  // Rebuild API client when settings change
  useEffect(() => {
    apiRef.current = createApi(apiUrl, isLive);
    if (isLive) {
      apiRef.current.getDevices().then(setDeviceList).catch(() => setDeviceList(DEMO_DEVICES));
    } else {
      setGroups(DEMO_GROUPS);
      setDeviceList(DEMO_DEVICES);
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
          "I can help you manage your Azure Arc environment. Try asking me to:\n\n• Deploy an app (e.g. \"Install Chrome on all machines\")\n• Push updates (e.g. \"Push quality update to all devices\")\n• Check machine status or compliance\n• Sync or restart a machine\n• Configure a setting (e.g. \"Set date/time region\")"
        );
        return;
      }

      switch (intent) {
        // ===========================================
        // APP DEPLOYMENT
        // ===========================================
        case "appDeployment": {
          if (app) {
            const devices = deviceList;
            const detectedDevices = findDeviceNames(userMessage, devices);
            setIsTyping(false);

            const DynamicAppDeploy = () => {
              const [targetConfirmed, setTargetConfirmed] = useState(false);
              const [targetDevices, setTargetDevices] = useState([]);
              const [targetAll, setTargetAll] = useState(false);

              const handleTargetConfirm = (selectedDevices, isAll) => {
                setTargetDevices(selectedDevices);
                setTargetAll(isAll);
                setTargetConfirmed(true);
              };

              const DynamicDeployCard = () => {
                const targetLabel = targetAll ? groupName : `${targetDevices.length} device${targetDevices.length !== 1 ? "s" : ""}`;
                const [status, setStatus] = useState("idle");
                const [steps, setSteps] = useState([
                  { key: "auth", label: "Authenticating with Azure ARM", status: "pending", timestamp: null },
                  { key: "create", label: `Submitting run command: ${app.name}`, status: "pending", timestamp: null },
                  { key: "install", label: `Installing on machine (polling every 5s)...`, status: "pending", timestamp: null },
                  { key: "done", label: "Deployment complete", status: "pending", timestamp: null },
                ]);
                const advance = (key, s, label) => setSteps(prev => prev.map(st =>
                  st.key === key ? { ...st, status: s, label: label || st.label, timestamp: (s === "done" || s === "error") ? new Date().toLocaleTimeString() : st.timestamp } : st
                ));
                const handleDeploy = async () => {
                  setStatus("deploying");
                  const abortCtrl = new AbortController();
                  try {
                    advance("auth", "active");
                    await demoDelay(isLive, 800);
                    advance("auth", "done");
                    advance("create", "active");
                    const deployTargets = targetAll ? deviceList : targetDevices;
                    for (const d of deployTargets) {
                      await api.deployApp(app.name, app.wingetId, d.id);
                    }
                    advance("create", "done");
                    advance("install", "active");
                    const firstTarget = (targetAll ? deviceList : targetDevices)[0];
                    if (isLive && firstTarget) {
                      const finalState = await api.pollDeployStatus(
                        firstTarget.id, app.wingetId,
                        (data) => {
                          const s = data.executionState || data.provisioningState;
                          advance("install", "active", `Installing on machine — ${s}...`);
                        },
                        abortCtrl.signal
                      );
                      if (finalState !== "Succeeded") throw new Error(`Install ended with: ${finalState}`);
                    } else {
                      await demoDelay(isLive, 1200);
                    }
                    advance("install", "done");
                    advance("done", "done");
                    setStatus("deployed");
                  } catch (e) {
                    abortCtrl.abort();
                    setSteps(prev => prev.map(st => st.status === "active" ? { ...st, status: "error", timestamp: new Date().toLocaleTimeString() } : st));
                    setStatus("error");
                  }
                };
                return (
                  <DeployCard
                    title={app.name}
                    subtitle={`Type: ${app.type}  •  Size: ${app.size}  •  WinGet: ${app.wingetId}`}
                    meta={<>Target: <span style={{ color: "#d4a574" }}>{targetLabel}</span></>}
                    gradient="#a67c00, #c9a227"
                    onDeploy={handleDeploy}
                    status={status}
                    steps={steps}
                  />
                );
              };

              return (
                <div>
                  <TargetSelector
                    devices={devices}
                    preSelected={detectedDevices}
                    onConfirm={handleTargetConfirm}
                    actionLabel="Deploy"
                    gradient="#a67c00, #c9a227"
                  />
                  {targetConfirmed && <DynamicDeployCard />}
                </div>
              );
            };

            addBot(
              `I'll deploy ${app.name} via Azure Arc WinGet extension. Select your target machines:`,
              <DynamicAppDeploy />
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

          const devices = deviceList;
          const detectedDevices = findDeviceNames(userMessage, devices);
          setIsTyping(false);

          const DynamicUpdateDeploy = () => {
            const [targetConfirmed, setTargetConfirmed] = useState(false);
            const [targetDevices, setTargetDevices] = useState([]);
            const [targetAll, setTargetAll] = useState(false);

            const handleTargetConfirm = (selectedDevices, isAll) => {
              setTargetDevices(selectedDevices);
              setTargetAll(isAll);
              setTargetConfirmed(true);
            };

            const DynamicUpdateCard = () => {
              const targetLabel = targetAll ? groupName : `${targetDevices.length} device${targetDevices.length !== 1 ? "s" : ""}`;
              const [status, setStatus] = useState("idle");
              const [steps, setSteps] = useState([
                { key: "auth", label: "Authenticating with Azure ARM", status: "pending", timestamp: null },
                { key: "create", label: `Triggering ${updateType} on ${targetLabel}`, status: "pending", timestamp: null },
                { key: "assign", label: "Patch install dispatched to machines", status: "pending", timestamp: null },
                { key: "done", label: "Update deployment initiated", status: "pending", timestamp: null },
              ]);
              const advance = (key, s) => setSteps(prev => prev.map(st =>
                st.key === key ? { ...st, status: s, timestamp: (s === "done" || s === "error") ? new Date().toLocaleTimeString() : st.timestamp } : st
              ));
              const handleDeploy = async () => {
                setStatus("deploying");
                try {
                  advance("auth", "active");
                  await demoDelay(isLive, 800);
                  advance("auth", "done");
                  advance("create", "active");
                  const updateTargets = targetAll ? deviceList : targetDevices;
                  for (const d of updateTargets) {
                    await api.pushUpdate(d.id);
                  }
                  await demoDelay(isLive, 1000);
                  advance("create", "done");
                  advance("assign", "active");
                  await demoDelay(isLive, 600);
                  advance("assign", "done");
                  advance("done", "done");
                  setStatus("deployed");
                } catch (e) {
                  setSteps(prev => prev.map(st => st.status === "active" ? { ...st, status: "error", timestamp: new Date().toLocaleTimeString() } : st));
                  setStatus("error");
                }
              };
              return (
                <DeployCard
                  title={`${icons[updateType] || "📦"} ${updateType}`}
                  subtitle={<>Target: <span style={{ color: "#d4a574" }}>{targetLabel}</span></>}
                  meta="Ring: Production  •  Deferral: 0 days"
                  gradient="#a67c00, #c9a227"
                  onDeploy={handleDeploy}
                  status={status}
                  steps={steps}
                />
              );
            };

            return (
              <div>
                <TargetSelector
                  devices={devices}
                  preSelected={detectedDevices}
                  onConfirm={handleTargetConfirm}
                  actionLabel="Deploy Update"
                  gradient="#a67c00, #c9a227"
                />
                {targetConfirmed && <DynamicUpdateCard />}
              </div>
            );
          };

          addBot(
            `I'll configure a ${updateType} deployment. Select your target devices:`,
            <DynamicUpdateDeploy />
          );
          break;
        }

        // ===========================================
        // DEVICE MANAGEMENT
        // ===========================================
        case "devices": {
          if (lower.includes("sync")) {
            const devices = deviceList;
            const detectedDevices = findDeviceNames(userMessage, devices);
            setIsTyping(false);

            const SyncWithTargeting = () => {
              const [targetConfirmed, setTargetConfirmed] = useState(false);
              const [targetDevices, setTargetDevices] = useState([]);

              const handleTargetConfirm = (selectedDevices) => {
                setTargetDevices(selectedDevices);
                setTargetConfirmed(true);
              };

              const MassSyncTracker = () => {
                const [deviceStates, setDeviceStates] = useState(targetDevices.map(d => ({ id: d.id, name: d.name, status: "pending" })));
                const [completed, setCompleted] = useState(0);
                const [finished, setFinished] = useState(false);
                const hasRun = useRef(false);
                useEffect(() => {
                  if (hasRun.current) return;
                  hasRun.current = true;
                  const aborted = { current: false };
                  (async () => {
                    for (let i = 0; i < targetDevices.length; i++) {
                      if (aborted.current) break;
                      const d = targetDevices[i];
                      setDeviceStates(prev => prev.map(s => s.id === d.id ? { ...s, status: "processing" } : s));
                      await demoDelay(isLive, 400 + Math.random() * 400);
                      try {
                        await api.syncDevice(d.id);
                        setDeviceStates(prev => prev.map(s => s.id === d.id ? { ...s, status: "success" } : s));
                        updateDeviceStatus(d.id, { lastSync: "Just now", status: "Compliant" });
                      } catch {
                        setDeviceStates(prev => prev.map(s => s.id === d.id ? { ...s, status: "error" } : s));
                      }
                      setCompleted(prev => prev + 1);
                    }
                    if (!aborted.current) setFinished(true);
                  })();
                  return () => { aborted.current = true; };
                }, []);
                return (
                  <div>
                    <LiveActionTracker actionLabel="Sync" deviceStates={deviceStates} totalCount={targetDevices.length} completedCount={completed} />
                    {finished && (
                      <InfoBox color="#d4a574" borderColor="#4a3a1a" bg="#2a2416">
                        {deviceStates.filter(d => d.status === "success").length} device{targetDevices.length !== 1 ? "s" : ""} synced. Check-in results will appear within 15 minutes.
                      </InfoBox>
                    )}
                  </div>
                );
              };

              return (
                <div>
                  <TargetSelector
                    devices={devices}
                    preSelected={detectedDevices.length > 0 ? detectedDevices : devices}
                    onConfirm={handleTargetConfirm}
                    actionLabel="Sync"
                    gradient="#a67c00, #c9a227"
                  />
                  {targetConfirmed && <MassSyncTracker />}
                </div>
              );
            };

            addBot(`Select devices to sync:`, <SyncWithTargeting />);
          } else if (lower.includes("wipe") || lower.includes("retire")) {
            const isWipe = lower.includes("wipe");
            const actionName = isWipe ? "Wipe" : "Retire";
            const devices = deviceList;
            setIsTyping(false);

            const DestructiveActionWithTargeting = () => {
              const [targetConfirmed, setTargetConfirmed] = useState(false);
              const [targetDevices, setTargetDevices] = useState([]);
              const [executing, setExecuting] = useState(false);
              const [result, setResult] = useState(null);

              const handleTargetConfirm = (selectedDevices) => {
                setTargetDevices(selectedDevices);
                setTargetConfirmed(true);
              };

              const handleExecute = async () => {
                const names = targetDevices.map(d => d.name).join(", ");
                if (!window.confirm(`⚠️ ${actionName} ${targetDevices.length} device${targetDevices.length !== 1 ? "s" : ""}?\n\n${names}\n\n${isWipe ? "This will FACTORY RESET the device(s). All data will be lost." : "This will remove company data from the device(s)."}\n\nThis cannot be undone.`)) return;
                setExecuting(true);
                let ok = 0, fail = 0;
                const removedIds = [];
                for (const d of targetDevices) {
                  try {
                    if (isWipe) await api.wipeDevice(d.id);
                    else await api.retireDevice(d.id);
                    await demoDelay(isLive, 400);
                    ok++;
                    removedIds.push(d.id);
                  } catch { fail++; }
                }
                if (removedIds.length > 0) removeDevices(removedIds);
                setExecuting(false);
                setResult({ ok, fail, total: targetDevices.length });
              };

              return (
                <div>
                  <TargetSelector
                    devices={devices}
                    preSelected={[]}
                    onConfirm={handleTargetConfirm}
                    actionLabel={actionName}
                    gradient={isWipe ? "#dc2626, #ef4444" : "#7c3aed, #8b5cf6"}
                  />
                  {targetConfirmed && !result && (
                    <div style={{ marginTop: 8 }}>
                      <InfoBox color="#fbbf24" borderColor="#78350f" bg="#3b2e10">
                        ⚠️ {actionName === "Wipe" ? "Factory reset" : "Company data removal"} will be executed on {targetDevices.length} device{targetDevices.length !== 1 ? "s" : ""}. This action cannot be undone.
                      </InfoBox>
                      <button onClick={handleExecute} disabled={executing} style={{
                        marginTop: 10, width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
                        fontWeight: 600, fontSize: 13, cursor: executing ? "not-allowed" : "pointer",
                        background: isWipe ? "#dc2626" : "#7c3aed",
                        color: "#fff", opacity: executing ? 0.6 : 1,
                      }}>
                        {executing ? `${actionName}ing...` : `Confirm ${actionName} (${targetDevices.length} device${targetDevices.length !== 1 ? "s" : ""})`}
                      </button>
                    </div>
                  )}
                  {result && (
                    <InfoBox
                      color={result.fail === 0 ? "#34d399" : "#f87171"}
                      borderColor={result.fail === 0 ? "#166534" : "#7f1d1d"}
                      bg={result.fail === 0 ? "#0d3320" : "#3b1118"}
                    >
                      {actionName} complete: {result.ok} succeeded{result.fail > 0 ? `, ${result.fail} failed` : ""} out of {result.total} device{result.total !== 1 ? "s" : ""}.
                    </InfoBox>
                  )}
                </div>
              );
            };

            addBot(
              `⚠️ ${actionName} is a destructive action. Select the target devices carefully — nothing is pre-selected for safety:`,
              <DestructiveActionWithTargeting />
            );
          } else if (lower.includes("restart") || lower.includes("reboot")) {
            const devices = deviceList;
            const detectedDevices = findDeviceNames(userMessage, devices);
            setIsTyping(false);

            const RebootWithTargeting = () => {
              const [targetConfirmed, setTargetConfirmed] = useState(false);
              const [targetDevices, setTargetDevices] = useState([]);

              const handleTargetConfirm = (selectedDevices) => {
                setTargetDevices(selectedDevices);
                setTargetConfirmed(true);
              };

              const MassRebootTracker = () => {
                const [deviceStates, setDeviceStates] = useState(targetDevices.map(d => ({ id: d.id, name: d.name, status: "pending" })));
                const [completed, setCompleted] = useState(0);
                const [finished, setFinished] = useState(false);
                const hasRun = useRef(false);
                useEffect(() => {
                  if (hasRun.current) return;
                  hasRun.current = true;
                  const aborted = { current: false };
                  (async () => {
                    for (let i = 0; i < targetDevices.length; i++) {
                      if (aborted.current) break;
                      const d = targetDevices[i];
                      setDeviceStates(prev => prev.map(s => s.id === d.id ? { ...s, status: "processing" } : s));
                      await demoDelay(isLive, 400 + Math.random() * 400);
                      try {
                        await api.rebootDevice(d.id);
                        setDeviceStates(prev => prev.map(s => s.id === d.id ? { ...s, status: "success" } : s));
                      } catch {
                        setDeviceStates(prev => prev.map(s => s.id === d.id ? { ...s, status: "error" } : s));
                      }
                      setCompleted(prev => prev + 1);
                    }
                    if (!aborted.current) setFinished(true);
                  })();
                  return () => { aborted.current = true; };
                }, []);
                return (
                  <div>
                    <LiveActionTracker actionLabel="Restart" deviceStates={deviceStates} totalCount={targetDevices.length} completedCount={completed} />
                    {finished && (
                      <InfoBox color="#fbbf24" borderColor="#78350f" bg="#3b2e10">
                        {deviceStates.filter(d => d.status === "success").length} device{targetDevices.length !== 1 ? "s" : ""} will restart within the next maintenance window. Users receive a 15-minute warning.
                      </InfoBox>
                    )}
                  </div>
                );
              };

              return (
                <div>
                  <TargetSelector
                    devices={devices}
                    preSelected={detectedDevices.length > 0 ? detectedDevices : devices}
                    onConfirm={handleTargetConfirm}
                    actionLabel="Restart"
                    gradient="#d97706, #f59e0b"
                  />
                  {targetConfirmed && <MassRebootTracker />}
                </div>
              );
            };

            addBot(`Select devices to restart:`, <RebootWithTargeting />);
          } else {
            const devices = deviceList;
            setIsTyping(false);
            const DeviceTableWithActions = () => {
              const [selected, setSelected] = useState([]);
              const [actionMsg, setActionMsg] = useState(null);
              const [busy, setBusy] = useState(false);
              const [deviceTracker, setDeviceTracker] = useState(null);
              const handleAction = async (id, name, action) => {
                const label = action === "sync" ? "Sync" : "Restart";
                setActionMsg({ ok: null, text: `Sending ${label.toLowerCase()} to ${name}...`, phase: "enter" });
                try {
                  if (action === "sync") {
                    await api.syncDevice(id);
                    updateDeviceStatus(id, { lastSync: "Just now", status: "Compliant" });
                  } else if (action === "reboot") {
                    await api.rebootDevice(id);
                  }
                  await demoDelay(isLive, 600);
                  setActionMsg({ ok: true, text: `${label} sent to ${name}`, phase: "visible" });
                } catch (e) {
                  setActionMsg({ ok: false, text: `Failed: ${e.message}`, phase: "visible" });
                }
                setTimeout(() => setActionMsg(prev => prev ? { ...prev, phase: "exit" } : null), 2500);
                setTimeout(() => setActionMsg(null), 3000);
              };
              const bulkAction = async (actionFn, label, onSuccess) => {
                if (selected.length === 0) return;
                setBusy(true);
                const selectedDevices = devices.filter(d => selected.includes(d.id));
                setDeviceTracker({
                  actionLabel: label,
                  states: selectedDevices.map(d => ({ id: d.id, name: d.name, status: "pending" })),
                  total: selectedDevices.length, completed: 0,
                });
                let ok = 0, fail = 0;
                for (const dev of selectedDevices) {
                  setDeviceTracker(prev => ({
                    ...prev,
                    states: prev.states.map(s => s.id === dev.id ? { ...s, status: "processing" } : s),
                  }));
                  await demoDelay(isLive, 400 + Math.random() * 400);
                  try {
                    await actionFn(dev.id);
                    ok++;
                    if (onSuccess) onSuccess(dev.id);
                    setDeviceTracker(prev => ({
                      ...prev, completed: prev.completed + 1,
                      states: prev.states.map(s => s.id === dev.id ? { ...s, status: "success" } : s),
                    }));
                  } catch {
                    fail++;
                    setDeviceTracker(prev => ({
                      ...prev, completed: prev.completed + 1,
                      states: prev.states.map(s => s.id === dev.id ? { ...s, status: "error" } : s),
                    }));
                  }
                }
                setBusy(false);
                setActionMsg({
                  ok: fail === 0, phase: "visible",
                  text: `${label}: ${ok} succeeded${fail > 0 ? `, ${fail} failed` : ""} out of ${selected.length} device${selected.length !== 1 ? "s" : ""}`,
                });
                setTimeout(() => setDeviceTracker(null), 8000);
                setTimeout(() => setActionMsg(null), 8000);
              };
              const confirmDestructive = (action, fn, onSuccess) => {
                const names = devices.filter(d => selected.includes(d.id)).map(d => d.name).join(", ");
                if (window.confirm(`${action} ${selected.length} device${selected.length !== 1 ? "s" : ""}?\n\n${names}\n\nThis cannot be undone.`)) {
                  bulkAction(fn, action, onSuccess);
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
                      onSync={() => bulkAction(api.syncDevice, "Sync", (id) => updateDeviceStatus(id, { lastSync: "Just now", status: "Compliant" }))}
                      onReboot={() => confirmDestructive("Restart", api.rebootDevice)}
                      onRetire={() => confirmDestructive("Retire", api.retireDevice, (id) => removeDevices([id]))}
                      onWipe={() => confirmDestructive("Wipe", api.wipeDevice, (id) => removeDevices([id]))}
                      onClear={() => setSelected([])}
                    />
                  )}
                  {deviceTracker && (
                    <LiveActionTracker
                      actionLabel={deviceTracker.actionLabel}
                      deviceStates={deviceTracker.states}
                      totalCount={deviceTracker.total}
                      completedCount={deviceTracker.completed}
                    />
                  )}
                  {actionMsg && (
                    <div style={{
                      animation: actionMsg.phase === "enter" ? "fadeSlideIn 0.3s ease" : actionMsg.phase === "exit" ? "fadeSlideOut 0.3s ease forwards" : "none",
                    }}>
                      <InfoBox
                        color={actionMsg.ok === null ? "#d4a574" : actionMsg.ok ? "#34d399" : "#f87171"}
                        borderColor={actionMsg.ok === null ? "#4a3a1a" : actionMsg.ok ? "#166534" : "#7f1d1d"}
                        bg={actionMsg.ok === null ? "#2a2416" : actionMsg.ok ? "#0d3320" : "#3b1118"}
                      >{actionMsg.text}</InfoBox>
                    </div>
                  )}
                </div>
              );
            };
            addBot(
              `${isLive ? "Live" : "Demo"} machine inventory — ${devices.length} Arc-connected machines. Select individual machines or use the checkbox to select all:`,
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
            const [deviceTracker, setDeviceTracker] = useState(null);
            const bulkSync = async () => {
              if (selected.length === 0) return;
              setBusy(true);
              setActionMsg(null);
              const selDevices = selected.map(id => {
                const d = devices.find(dev => dev.id === id);
                return { id, name: d ? (d.name || d.deviceName || id) : id, status: "pending" };
              });
              setDeviceTracker({ states: selDevices, completed: 0 });
              let ok = 0;
              for (let i = 0; i < selDevices.length; i++) {
                setDeviceTracker(prev => ({
                  ...prev,
                  states: prev.states.map((d, idx) => idx === i ? { ...d, status: "processing" } : d),
                }));
                await demoDelay(isLive, 600);
                try {
                  await api.syncDevice(selDevices[i].id);
                  ok++;
                  setDeviceTracker(prev => ({
                    ...prev,
                    completed: prev.completed + 1,
                    states: prev.states.map((d, idx) => idx === i ? { ...d, status: "success" } : d),
                  }));
                } catch {
                  setDeviceTracker(prev => ({
                    ...prev,
                    completed: prev.completed + 1,
                    states: prev.states.map((d, idx) => idx === i ? { ...d, status: "error" } : d),
                  }));
                }
              }
              setBusy(false);
              setActionMsg({ ok: true, text: `Sync sent to ${ok} of ${selected.length} selected device${selected.length !== 1 ? "s" : ""}` });
            };
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                  {[
                    { label: "Compliant", count: summary.compliant, color: "#34d399", bg: "#0d3320" },
                    { label: "Non-Compliant", count: summary.noncompliant, color: "#f87171", bg: "#3b1118" },
                    { label: "Grace Period", count: summary.inGracePeriod, color: "#fbbf24", bg: "#3b2e10" },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 4, padding: "14px 16px", textAlign: "center" }}>
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
                {deviceTracker && (
                  <LiveActionTracker
                    actionLabel="Compliance Sync"
                    deviceStates={deviceTracker.states}
                    totalCount={deviceTracker.states.length}
                    completedCount={deviceTracker.completed}
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
            `${isLive ? "Live" : "Demo"} Arc dashboard from Azure ARM:`,
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                {[
                  { label: "Arc Machines", value: total, icon: "💻", color: "#d4a574" },
                  { label: "Non-Compliant", value: nonCompliant, icon: "⚠️", color: nonCompliant > 0 ? "#f87171" : "#34d399" },
                  { label: "Compliant", value: compliance.summary.compliant, icon: "✅", color: "#34d399" },
                  { label: "Grace Period", value: compliance.summary.inGracePeriod, icon: "⏳", color: "#fbbf24" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "#0c1524", border: "1px solid #1a2740",
                    borderRadius: 4, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                    transition: "all 0.2s ease",
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
                🏥 Service Health: {isLive ? "Connected to Azure ARM" : "Demo mode"} • Provider: Microsoft.HybridCompute
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
              const [steps, setSteps] = useState([
                { key: "auth", label: "Authenticating with Azure ARM", status: "pending", timestamp: null },
                { key: "create", label: "Deploying configuration extension", status: "pending", timestamp: null },
                { key: "assign", label: "Pushing to all Arc machines", status: "pending", timestamp: null },
                { key: "done", label: "Configuration applied", status: "pending", timestamp: null },
              ]);
              const advance = (key, s) => setSteps(prev => prev.map(st =>
                st.key === key ? { ...st, status: s, timestamp: (s === "done" || s === "error") ? new Date().toLocaleTimeString() : st.timestamp } : st
              ));
              const handleDeploy = async () => {
                setStatus("deploying");
                try {
                  advance("auth", "active");
                  await demoDelay(isLive, 800);
                  advance("auth", "done");
                  advance("create", "active");
                  const machineNames = deviceList.map(d => d.id);
                  await api.createConfigProfile("DateTimeConfig", ["Set-TimeZone -Id 'Eastern Standard Time'"], machineNames);
                  await demoDelay(isLive, 1000);
                  advance("create", "done");
                  advance("assign", "active");
                  await demoDelay(isLive, 600);
                  advance("assign", "done");
                  advance("done", "done");
                  setStatus("deployed");
                } catch (e) {
                  setSteps(prev => prev.map(st => st.status === "active" ? { ...st, status: "error", timestamp: new Date().toLocaleTimeString() } : st));
                  setStatus("error");
                }
              };
              return (
                <div style={{
                  background: "#0c1524",
                  border: "1px solid #1a2740",
                  borderRadius: 4, padding: 18, marginTop: 8,
                }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>Configuration Profile</div>
                  <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", lineHeight: 1.8 }}>
                    <div><span style={{ color: "#64748b" }}>Platform:</span> Windows 10/11</div>
                    <div><span style={{ color: "#64748b" }}>Extension Type:</span> RunCommandHandlerWindows</div>
                    <div><span style={{ color: "#64748b" }}>Set-TimeZone:</span> <span style={{ color: "#34d399" }}>Eastern Standard Time</span></div>
                    <div><span style={{ color: "#64748b" }}>Scope:</span> All Arc-connected machines</div>
                    <div><span style={{ color: "#64748b" }}>API Endpoint:</span> <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#d4a574" }}>PUT /config/extension</span></div>
                  </div>
                  {status === "idle" && (
                    <button onClick={handleDeploy} style={{
                      marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 3, border: "none",
                      fontWeight: 600, fontSize: 13, cursor: "pointer",
                      background: "#0d9488", color: "#fff",
                    }}>Create & Assign Profile</button>
                  )}
                  {status === "deploying" && <StepProgress steps={steps} gradient="#0d9488, #14b8a6" />}
                  {status === "deployed" && (
                    <div>
                      <StepProgress steps={steps} gradient="#0d9488, #14b8a6" />
                      <InfoBox color="#34d399" borderColor="#166534" bg="#0d3320">
                        Extension deployed via Azure Arc. Machines will apply settings on next agent check-in.
                      </InfoBox>
                    </div>
                  )}
                  {status === "error" && (
                    <div>
                      <StepProgress steps={steps} gradient="#0d9488, #14b8a6" />
                      <InfoBox color="#f87171" borderColor="#7f1d1d" bg="#3b1118">
                        Failed to create profile. Check API permissions.
                      </InfoBox>
                    </div>
                  )}
                </div>
              );
            };
            addBot(
              "Based on Team 2's travel policy, I'll deploy a Date, Time & Region configuration extension via Azure Arc run-command.",
              <DynamicConfigCard />
            );
          } else {
            setIsTyping(false);
            addBot(
              "I can deploy configuration extensions via Azure Arc run-command. What would you like to configure? Options include: Date/Time/Region settings, timezone, software installs, device restrictions, and custom PowerShell scripts."
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
          API call failed. {isLive ? "Check your Azure backend connection and ARM permissions (CLIENT_ID, TENANT_ID, CLIENT_SECRET)." : "Unexpected error in demo mode."}
        </InfoBox>
      );
    }
  }, [addBot, isLive, deviceList, updateDeviceStatus, removeDevices]);

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
      width: "100%", height: "100vh",
      display: "flex", flexDirection: "column",
      background: "#0c0c0e",
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-6px); opacity: 1; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeSlideOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }

        @keyframes progressShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        ::selection { background: rgba(201,162,39,0.25); color: #f5f5f4; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(30,41,59,0.5); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(51,65,85,0.6); }
        input:focus { border-color: #c9a227 !important; box-shadow: 0 0 0 2px rgba(201,162,39,0.2) !important; }
      `}</style>

      {showSettings && (
        <SettingsPanel apiUrl={apiUrl} setApiUrl={setApiUrl} isLive={isLive} setIsLive={setIsLive}
          onClose={() => setShowSettings(false)} onTest={testConnection} />
      )}

      {/* Header */}
      <div style={{
        padding: "10px 20px",
        background: "#080e1a",
        flexShrink: 0,
        borderBottom: "1px solid rgba(30,41,59,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
              color: "#c9a227", border: "1px solid #4a3a1a", padding: "4px 8px", borderRadius: 3,
            }}>ACC</div>
            <div>
              <div style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Arc Command Center</div>
              <div style={{ color: "#475569", fontSize: 11, fontWeight: 500, letterSpacing: 0.3 }}>
                Team 2 &middot; CloudGuard Consulting
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); if (!isLive) setDeviceList(DEMO_DEVICES); }} title="New conversation"
                style={{
                  height: 34, paddingInline: 14, borderRadius: 3,
                  border: "1px solid rgba(30,41,59,0.5)",
                  background: "#0c1524",
                  color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 500,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.15s", fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#2a3f5f"; e.currentTarget.style.color = "#e2e8f0"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(30,41,59,0.5)"; e.currentTarget.style.color = "#94a3b8"; }}
              >⌂ Home</button>
            )}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: isLive ? "#34d399" : "#fbbf24",
              }} />
              <span style={{ color: isLive ? "#34d399" : "#fbbf24", fontSize: 10, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                {isLive ? "LIVE" : "DEMO"}
              </span>
            </div>
            <button onClick={() => setShowSettings(true)} style={{
              width: 34, height: 34, borderRadius: 3,
              border: "1px solid rgba(30,41,59,0.5)",
              background: "#0c1524",
              color: "#94a3b8", cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#2a3f5f"; e.currentTarget.style.color = "#e2e8f0"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(30,41,59,0.5)"; e.currentTarget.style.color = "#94a3b8"; }}
            >⚙️</button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {messages.length === 0 ? (
            <WelcomeScreen onQuickAction={handleQuickAction} isLive={isLive} />
          ) : (
            <>
              {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
              {isTyping && (
                <div style={{ padding: "4px 0" }}>
                  <TypingIndicator />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {messages.length > 0 && messages.length < 3 && (
        <div style={{ padding: "0 20px 10px" }}>
          <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Deploy Chrome to all machines", "Show compliance", "Push quality update", "Sync all devices"].map(s => (
              <button key={s} onClick={() => handleQuickAction(s)}
                style={{
                  padding: "6px 12px", borderRadius: 3,
                  border: "1px solid #1a2740",
                  background: "#0c1524",
                  color: "#94a3b8", fontSize: 12, cursor: "pointer",
                  transition: "all 0.15s", fontWeight: 500, fontFamily: "inherit",
                }}
                onMouseEnter={e => {
                  e.target.style.borderColor = "#2a3f5f";
                  e.target.style.color = "#e2e8f0";
                }}
                onMouseLeave={e => {
                  e.target.style.borderColor = "#1a2740";
                  e.target.style.color = "#94a3b8";
                }}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 20px 14px",
        background: "#080e1a",
        flexShrink: 0,
        borderTop: "1px solid rgba(30,41,59,0.3)",
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="Deploy Chrome to all PCs, push latest update, check compliance..."
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 3,
                border: "1px solid rgba(24,36,65,0.8)",
                background: "#0c1524",
                color: "#e2e8f0", fontSize: 14, outline: "none",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping}
              style={{
                width: 44, height: 44, borderRadius: 3, border: "none",
                background: input.trim() && !isTyping ? "#a67c00" : "#1a1a1a",
                color: input.trim() && !isTyping ? "#fff" : "#475569",
                fontSize: 18, cursor: input.trim() && !isTyping ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", flexShrink: 0,
              }}>↑</button>
          </div>
          <div style={{ textAlign: "left", marginTop: 8, color: "#334155", fontSize: 10, letterSpacing: 0.3, fontFamily: "'JetBrains Mono', monospace" }}>
            {isLive ? `Connected to ${apiUrl}` : "Demo mode — open settings to connect your Azure backend"}
          </div>
        </div>
      </div>
    </div>
  );
}
