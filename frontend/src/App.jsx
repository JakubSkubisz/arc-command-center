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
    <div className="flex gap-1 py-2 items-center">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-slate-400"
          style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = {
    Compliant:        "bg-emerald-50 text-emerald-700 border-emerald-200",
    Connected:        "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Non-Compliant":  "bg-red-50 text-red-600 border-red-200",
    Disconnected:     "bg-red-50 text-red-600 border-red-200",
    "In Grace Period":"bg-amber-50 text-amber-700 border-amber-200",
    Pending:          "bg-slate-100 text-slate-500 border-slate-200",
    Deployed:         "bg-emerald-50 text-emerald-700 border-emerald-200",
    Queued:           "bg-blue-50 text-blue-600 border-blue-200",
    Error:            "bg-red-50 text-red-600 border-red-200",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border uppercase tracking-wide ${cls[status] || cls.Pending}`}>
      {status}
    </span>
  );
}

function ActionCard({ icon, title, subtitle, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left border border-slate-200 rounded-lg p-3.5 bg-white hover:border-blue-300 hover:shadow-sm transition-all duration-150 group">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="text-slate-800 text-sm font-semibold group-hover:text-blue-700 transition-colors">{title}</div>
          {subtitle && <div className="text-slate-400 text-xs mt-0.5">{subtitle}</div>}
        </div>
      </div>
    </button>
  );
}

function InfoBox({ color, borderColor, bg, children }) {
  // map old dark colors to light equivalents
  const isGreen = color === "#34d399";
  const isRed   = color === "#f87171";
  const cls = isGreen
    ? "bg-emerald-50 border-l-emerald-500 border-emerald-200 text-emerald-800"
    : isRed
    ? "bg-red-50 border-l-red-500 border-red-200 text-red-700"
    : "bg-amber-50 border-l-amber-500 border-amber-200 text-amber-800";
  return (
    <div className={`mt-2 px-4 py-3 rounded border border-l-4 text-xs leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

function StepProgress({ steps }) {
  return (
    <div className="mt-3 space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const dotCls = step.status === "done"  ? "bg-emerald-500 border-emerald-500"
                     : step.status === "active" ? "bg-blue-500 border-blue-500"
                     : step.status === "error"  ? "bg-red-500 border-red-500"
                     : "bg-white border-slate-300";
        const textCls = step.status === "done"  ? "text-emerald-700 font-medium"
                      : step.status === "active" ? "text-blue-700 font-semibold"
                      : step.status === "error"  ? "text-red-600"
                      : "text-slate-400";
        const icon = step.status === "done" ? "✓" : step.status === "error" ? "✗" : step.status === "active" ? "…" : "";
        return (
          <div key={step.key || i} className="flex items-start">
            <div className="flex flex-col items-center mr-3 shrink-0">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold transition-all ${dotCls}`}>
                {icon}
              </div>
              {!isLast && <div className={`w-0.5 min-h-[18px] flex-1 transition-colors ${step.status === "done" ? "bg-emerald-300" : "bg-slate-200"}`} />}
            </div>
            <div className={`flex-1 flex justify-between items-center pb-3.5 min-h-[28px] ${isLast ? "pb-0" : ""}`}>
              <span className={`text-xs transition-all ${textCls}`}>{step.label}</span>
              {step.timestamp && <span className="text-xs font-mono text-slate-400 ml-3">{step.timestamp}</span>}
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
    <div className="mt-2 border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <span className="text-slate-800 text-sm font-semibold">{actionLabel} Progress</span>
        <span className="text-slate-400 text-xs font-mono">{completedCount}/{totalCount} ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
        {deviceStates.map(d => (
          <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
            <span className={`text-xs font-mono ${d.status === "processing" ? "text-blue-700 font-semibold" : d.status === "success" ? "text-emerald-700" : d.status === "error" ? "text-red-600" : "text-slate-500"}`}>{d.name}</span>
            <span className="text-xs text-right min-w-5">
              {d.status === "pending" && <span className="text-slate-300">—</span>}
              {d.status === "processing" && <span className="text-blue-500">…</span>}
              {d.status === "success" && <span className="text-emerald-500">✓</span>}
              {d.status === "error" && <span className="text-red-500">✗</span>}
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
  const toggleAll = () => { if (!onSelect) return; allSelected ? onSelect([]) : onSelect(devices.map(d => d.id)); };
  const toggleOne = (id) => { if (!onSelect) return; selected.includes(id) ? onSelect(selected.filter(s => s !== id)) : onSelect([...selected, id]); };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 mt-2">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50">
            {selectable && (
              <th className="px-3 py-2.5 border-b border-slate-200 w-8">
                <div onClick={toggleAll} className={`w-4 h-4 rounded cursor-pointer border-2 flex items-center justify-center transition-all ${allSelected ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"}`}>
                  {allSelected && <span className="text-white text-xs font-bold leading-none">✓</span>}
                  {someSelected && !allSelected && <span className="text-slate-400 text-xs leading-none">—</span>}
                </div>
              </th>
            )}
            {["Device", "OS", "Status", "Last Sync", ...(onAction ? ["Actions"] : [])].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {devices.map((d, i) => {
            const isChecked = selectable && selected && selected.includes(d.id);
            return (
              <tr key={d.id || i} onClick={() => selectable && toggleOne(d.id)}
                className={`transition-colors ${selectable ? "cursor-pointer" : ""} ${isChecked ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                {selectable && (
                  <td className="px-3 py-2.5">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isChecked ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"}`}>
                      {isChecked && <span className="text-white text-xs font-bold leading-none">✓</span>}
                    </div>
                  </td>
                )}
                <td className="px-3 py-2.5 font-mono font-medium text-slate-800">{d.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{d.os}</td>
                <td className="px-3 py-2.5"><StatusBadge status={d.status} /></td>
                <td className="px-3 py-2.5 text-slate-400">{d.lastSync}</td>
                {onAction && (
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      {[{ label: "⟳", action: "sync", title: "Sync" }, { label: "↻", action: "reboot", title: "Restart" }].map(a => (
                        <button key={a.action} title={a.title}
                          onClick={(e) => { e.stopPropagation(); onAction(d.id, d.name, a.action); }}
                          className="w-7 h-7 rounded border border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center text-sm">
                          {a.label}
                        </button>
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
  const op = busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
  return (
    <div className="mt-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between flex-wrap gap-3 fade-in">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
        device{count !== 1 ? "s" : ""} selected
        <button onClick={onClear} className="text-slate-400 hover:text-slate-600 text-xs underline ml-1">Clear</button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "⟳ Sync",    fn: onSync,   cls: "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600" },
          { label: "↻ Restart", fn: onReboot, cls: "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600" },
          { label: "⏏ Retire",  fn: onRetire, cls: "bg-white border-slate-200 text-slate-600 hover:border-purple-300 hover:text-purple-600" },
          { label: "⚠ Wipe",   fn: onWipe,   cls: "bg-white border-red-200 text-red-500 hover:border-red-400 hover:bg-red-50" },
        ].map(b => (
          <button key={b.label} onClick={b.fn} disabled={busy}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${b.cls} ${op}`}>
            {b.label}
          </button>
        ))}
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

  if (confirmed) {
    const isAll = mode === "all";
    return (
      <div className="mt-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 fade-in">
        <span className="text-emerald-600 font-bold">✓</span>
        <span className="text-slate-600 text-sm">
          Targeting:{" "}
          <span className="font-semibold text-slate-800">
            {isAll ? `All Devices (${devices.length})` : `${selected.length} device${selected.length !== 1 ? "s" : ""}`}
          </span>
          {!isAll && selected.length <= 3 && (
            <span className="text-slate-400 font-mono text-xs ml-2">
              ({devices.filter(d => selected.includes(d.id)).map(d => d.name).join(", ")})
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 border border-slate-200 rounded-lg p-4 bg-white fade-in">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Select target devices</span>
        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{selected.length}</span>
      </div>
      <div className="flex gap-2 mb-3">
        {[{ key: "all", label: "All Devices" }, { key: "specific", label: "Select Specific" }].map(opt => (
          <button key={opt.key} onClick={() => handleModeToggle(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${mode === opt.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
            {opt.label}
          </button>
        ))}
      </div>
      {mode === "specific" && (
        <DeviceTable devices={devices} selectable={true} selected={selected} onSelect={setSelected} />
      )}
      <button onClick={handleConfirm} disabled={selected.length === 0}
        className={`mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${selected.length > 0 ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
        {actionLabel ? `Confirm & ${actionLabel}` : "Confirm Targets"} ({selected.length} device{selected.length !== 1 ? "s" : ""})
      </button>
    </div>
  );
}

function DeployCard({ title, subtitle, meta, gradient, onDeploy, status, steps }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 mt-2 bg-white shadow-sm">
      <div className="flex justify-between items-start mb-1">
        <div>
          <div className="text-slate-900 font-bold text-sm">{title}</div>
          <div className="text-slate-500 text-xs mt-1">{subtitle}</div>
          {meta && <div className="text-slate-400 text-xs mt-0.5">{meta}</div>}
        </div>
        <StatusBadge status={status === "deployed" ? "Deployed" : status === "deploying" ? "Queued" : status === "error" ? "Error" : "Pending"} />
      </div>
      {status === "idle" && (
        <button onClick={onDeploy}
          className="mt-3 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all cursor-pointer">
          Confirm & Deploy
        </button>
      )}
      {status === "deploying" && (
        steps && steps.length > 0
          ? <StepProgress steps={steps} />
          : <div className="mt-3 text-center text-slate-500 text-sm py-2">Calling Azure ARM API...</div>
      )}
      {(status === "deployed" || status === "error") && (
        <div>
          {steps && steps.length > 0 && <StepProgress steps={steps} />}
          <InfoBox color={status === "deployed" ? "#34d399" : "#f87171"} borderColor="" bg="">
            {status === "deployed" ? "✓ Deployment successful. Devices will apply changes on next sync cycle." : "✗ Deployment failed. Check API connection and permissions."}
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900 font-bold text-base">Connection Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none transition-colors">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mode</label>
            <div className="flex gap-2">
              {[{ label: "Demo", value: false, desc: "Simulated data" }, { label: "Live", value: true, desc: "Azure backend" }].map(m => (
                <button key={m.label} onClick={() => setIsLive(m.value)}
                  className={`flex-1 py-2.5 px-4 rounded-xl border text-center transition-all ${isLive === m.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                  <div className="font-semibold text-sm">{m.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={isLive ? "" : "opacity-40 pointer-events-none"}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Azure API Base URL</label>
            <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
              placeholder="https://your-app.azurewebsites.net/api"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 bg-white placeholder-slate-400" />
          </div>

          {isLive && (
            <button onClick={runTest} disabled={testing}
              className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all bg-white disabled:opacity-50">
              {testing ? "Testing..." : "🔌 Test Connection"}
            </button>
          )}

          {testResult && (
            <InfoBox color={testResult.ok ? "#34d399" : "#f87171"} borderColor="" bg="">
              {testResult.ok ? `✓ Connected: ${testResult.service}` : `✗ ${testResult.error}`}
            </InfoBox>
          )}

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Live mode setup:</strong><br />
            1. Deploy the Node.js backend to Azure App Service<br />
            2. Register an Entra ID app with ARM permissions<br />
            3. Set CLIENT_ID, TENANT_ID, CLIENT_SECRET, SUBSCRIPTION_ID<br />
            4. Enter your App Service URL above
          </div>
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
  return (
    <div className="border border-slate-200 rounded-lg p-3.5 bg-white hover:border-blue-300 hover:shadow-sm transition-all duration-150">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">📦</span>
        <div>
          <div className="text-slate-800 text-sm font-semibold">Deploy an App</div>
          <div className="text-slate-400 text-xs mt-0.5">Push software to devices</div>
        </div>
      </div>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="flex-1 border border-slate-200 rounded text-xs px-2 py-1.5 bg-white text-slate-700 focus:border-blue-400 focus:outline-none cursor-pointer"
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
          className={`text-xs font-semibold px-3 py-1.5 rounded transition-all ${selected ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer" : "bg-slate-100 text-slate-400 cursor-default"}`}
        >
          Deploy
        </button>
      </div>
    </div>
  );
}

function WelcomeScreen({ onQuickAction, isLive }) {
  return (
    <div className="py-12">
      {/* Hero */}
      <div className="mb-10">
        <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full mb-5 border ${isLive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-400"}`} />
          {isLive ? "Connected to Azure Arc" : "Demo Mode — open settings to connect"}
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">
          Arc Command Center
        </h1>
        <p className="text-slate-500 text-base leading-relaxed max-w-md">
          Manage your Azure Arc fleet. Deploy apps, push patches, check machine health, and run commands — all in one place.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-10">
        <DeployAppCard onQuickAction={onQuickAction} />
        <ActionCard icon="🔄" title="Push Updates" subtitle="Windows quality patches" onClick={() => onQuickAction("Push latest quality update to All Devices")} />
        <ActionCard icon="📊" title="Check Devices" subtitle="View fleet status" onClick={() => onQuickAction("Show me all device statuses")} />
        <ActionCard icon="🔒" title="Compliance" subtitle="View compliance report" onClick={() => onQuickAction("Show compliance status for all devices")} />
      </div>

      {/* Features */}
      <div className="border-t border-slate-100 pt-8">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-5">What you can do</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: "🖥️", title: "Device Management", desc: "List, sync, and reboot Arc-enrolled machines across your hybrid fleet." },
            { icon: "🛡️", title: "Patch Management", desc: "Assess and install Windows updates via Azure Update Manager." },
            { icon: "📋", title: "Compliance", desc: "Monitor connection status and policy compliance across all machines." },
          ].map(f => (
            <div key={f.title} className="p-4 rounded-lg border border-slate-100 bg-slate-50">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-slate-800 text-sm font-semibold mb-1">{f.title}</div>
              <div className="text-slate-500 text-xs leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className="flex justify-start mb-4 fade-in">
      <div className="max-w-[90%] w-full">
        {isUser ? (
          <div className="inline-block bg-slate-100 text-slate-800 text-sm font-medium px-4 py-2.5 rounded-xl rounded-tl-sm leading-relaxed">
            {message.text}
          </div>
        ) : (
          <div>
            {message.text && (
              <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-line mb-2">
                {message.text}
              </div>
            )}
            {message.component && (
              <div className="mt-1">
                {message.component}
              </div>
            )}
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
                      <InfoBox color="#34d399" borderColor="" bg="">
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
                    <div className="mt-2">
                      <InfoBox color="#f87171" borderColor="" bg="">
                        ⚠️ {actionName === "Wipe" ? "Factory reset" : "Company data removal"} will be executed on {targetDevices.length} device{targetDevices.length !== 1 ? "s" : ""}. This action cannot be undone.
                      </InfoBox>
                      <button onClick={handleExecute} disabled={executing}
                        className={`mt-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${executing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${isWipe ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"}`}>
                        {executing ? `${actionName}ing...` : `Confirm ${actionName} (${targetDevices.length} device${targetDevices.length !== 1 ? "s" : ""})`}
                      </button>
                    </div>
                  )}
                  {result && (
                    <InfoBox color={result.fail === 0 ? "#34d399" : "#f87171"} borderColor="" bg="">
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
                      <InfoBox color="#34d399" borderColor="" bg="">
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
                  <InfoBox color={actionMsg.ok ? "#34d399" : "#f87171"} borderColor="" bg="">
                    {actionMsg.text}
                  </InfoBox>
                )}
                {nonCompliantNames && (
                  <InfoBox color="#94a3b8" borderColor="" bg="">
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
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { label: "Arc Machines", value: total, icon: "💻", cls: "text-blue-700" },
                  { label: "Non-Compliant", value: nonCompliant, icon: "⚠️", cls: nonCompliant > 0 ? "text-red-600" : "text-emerald-600" },
                  { label: "Compliant", value: compliance.summary.compliant, icon: "✅", cls: "text-emerald-600" },
                  { label: "Grace Period", value: compliance.summary.inGracePeriod, icon: "⏳", cls: "text-amber-600" },
                ].map(s => (
                  <div key={s.label} className="border border-slate-200 rounded-lg p-3 bg-white flex items-center gap-3">
                    <span className="text-xl">{s.icon}</span>
                    <div>
                      <div className={`text-xl font-extrabold ${s.cls}`}>{s.value}</div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <InfoBox color="#94a3b8" borderColor="" bg="">
                🏥 Service Health: {isLive ? "Connected to Azure ARM" : "Demo mode"} · Provider: Microsoft.HybridCompute
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
                <div className="border border-slate-200 rounded-lg p-4 mt-2 bg-white shadow-sm">
                  <div className="text-slate-900 font-bold text-sm mb-3">Configuration Profile</div>
                  <div className="text-xs text-slate-500 space-y-1.5 leading-relaxed">
                    <div><span className="text-slate-400">Platform:</span> Windows 10/11</div>
                    <div><span className="text-slate-400">Extension Type:</span> RunCommandHandlerWindows</div>
                    <div><span className="text-slate-400">Set-TimeZone:</span> <span className="text-emerald-600 font-medium">Eastern Standard Time</span></div>
                    <div><span className="text-slate-400">Scope:</span> All Arc-connected machines</div>
                    <div><span className="text-slate-400">API Endpoint:</span> <span className="font-mono text-blue-600">PUT /config/extension</span></div>
                  </div>
                  {status === "idle" && (
                    <button onClick={handleDeploy}
                      className="mt-3 w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-all">
                      Create & Assign Profile
                    </button>
                  )}
                  {status === "deploying" && <StepProgress steps={steps} />}
                  {status === "deployed" && (
                    <div>
                      <StepProgress steps={steps} />
                      <InfoBox color="#34d399" borderColor="" bg="">
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
    <div className="flex flex-col h-screen bg-white font-sans overflow-hidden">

      {showSettings && (
        <SettingsPanel apiUrl={apiUrl} setApiUrl={setApiUrl} isLive={isLive} setIsLive={setIsLive}
          onClose={() => setShowSettings(false)} onTest={testConnection} />
      )}

      {/* Nav */}
      <nav className="border-b border-slate-100 bg-white/90 backdrop-blur-sm shrink-0 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold font-mono">A</span>
            </div>
            <div>
              <span className="text-slate-900 font-bold text-sm tracking-tight">Arc Command Center</span>
              <span className="text-slate-400 text-xs ml-2 hidden sm:inline">Team 2 · CloudGuard Consulting</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); if (!isLive) setDeviceList(DEMO_DEVICES); }}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all"
              >
                ⌂ Home
              </button>
            )}
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${isLive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-400"}`} />
              {isLive ? "Live" : "Demo"}
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-all text-sm"
            >
              ⚙️
            </button>
          </div>
        </div>
      </nav>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <WelcomeScreen onQuickAction={handleQuickAction} isLive={isLive} />
          ) : (
            <>
              {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
              {isTyping && <TypingIndicator />}
            </>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {messages.length > 0 && messages.length < 3 && (
        <div className="px-4 pb-2">
          <div className="max-w-3xl mx-auto flex gap-2 flex-wrap">
            {["Deploy Chrome to all machines", "Show compliance", "Push quality update", "Sync all devices"].map(s => (
              <button key={s} onClick={() => handleQuickAction(s)}
                className="text-xs text-slate-500 border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-3 py-1.5 rounded-full transition-all font-medium bg-white"
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-100 bg-white shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-center">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="Deploy Chrome, push updates, check compliance..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 font-sans bg-white transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all shrink-0 ${input.trim() && !isTyping ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
            >↑</button>
          </div>
          <p className="text-xs text-slate-400 mt-2 font-mono">
            {isLive ? `Connected · ${apiUrl}` : "Demo mode — open settings to connect your Azure backend"}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-50 bg-white shrink-0 px-4 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-xs text-slate-300 font-mono">Arc Command Center · IT-4810 · Spring 2026</span>
          <span className="text-xs text-slate-300">Governors State University</span>
        </div>
      </div>
    </div>
  );
}
