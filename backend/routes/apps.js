const { Router } = require("express");
const { armRequest, scopedPath } = require("../lib/azure");
const router = Router();

const PROVIDER = "Microsoft.HybridCompute/machines";

// Direct download scripts for apps that don't need WinGet
const DIRECT_INSTALL = {
  "Google.Chrome": `$p="$env:TEMP\\ChromeSetup.exe"; Invoke-WebRequest -Uri "https://dl.google.com/chrome/install/latest/chrome_installer.exe" -OutFile $p; Start-Process $p -Args "/silent /install" -Wait; Remove-Item $p`,
  "Mozilla.Firefox": `$p="$env:TEMP\\FirefoxSetup.exe"; Invoke-WebRequest -Uri "https://download.mozilla.org/?product=firefox-latest&os=win64&lang=en-US" -OutFile $p; Start-Process $p -Args "/S" -Wait; Remove-Item $p`,
  "7zip.7zip": `$p="$env:TEMP\\7zipSetup.exe"; Invoke-WebRequest -Uri "https://www.7-zip.org/a/7z2408-x64.exe" -OutFile $p; Start-Process $p -Args "/S" -Wait; Remove-Item $p`,
  "Microsoft.VisualStudioCode": `$p="$env:TEMP\\VSCodeSetup.exe"; Invoke-WebRequest -Uri "https://code.visualstudio.com/sha/download?build=stable&os=win32-x64" -OutFile $p; Start-Process $p -Args "/VERYSILENT /NORESTART" -Wait; Remove-Item $p`,
  "VideoLAN.VLC": `$p="$env:TEMP\\VLCSetup.exe"; Invoke-WebRequest -Uri "https://get.videolan.org/vlc/last/win64/vlc-3.0.21-win64.exe" -OutFile $p; Start-Process $p -Args "/S" -Wait; Remove-Item $p`,
  "Adobe.Acrobat.Reader.64-bit": `$p="$env:TEMP\\AcroRdrSetup.exe"; Invoke-WebRequest -Uri "https://ardownload2.adobe.com/pub/adobe/reader/win/AcrobatDC/2300820555/AcroRdrDC2300820555_en_US.exe" -OutFile $p; Start-Process $p -Args "/sAll /rs /msi /norestart /quiet EULA_ACCEPT=YES" -Wait; Remove-Item $p`,
  "Zoom.Zoom": `$p="$env:TEMP\\ZoomSetup.exe"; Invoke-WebRequest -Uri "https://zoom.us/client/latest/ZoomInstaller.exe" -OutFile $p; Start-Process $p -Args "/quiet /norestart" -Wait; Remove-Item $p`,
};

// GET /api/apps — List extensions (installed software/agents) on all machines
router.get("/", async (req, res, next) => {
  try {
    // List all machines first, then get extensions for each
    const machines = await armRequest(
      "GET",
      scopedPath(`providers/${PROVIDER}`)
    );

    const allExtensions = [];
    for (const machine of machines.value || []) {
      try {
        const exts = await armRequest(
          "GET",
          `${machine.id}/extensions`,
          null,
          "2024-07-10"
        );
        for (const ext of exts.value || []) {
          allExtensions.push({
            id: ext.id,
            displayName: ext.name,
            machine: machine.name,
            publisher: ext.properties?.publisher || "—",
            type: ext.properties?.type || "—",
            status: ext.properties?.provisioningState || "Unknown",
            createdDateTime: ext.properties?.settings?.timestamp || "—",
          });
        }
      } catch {
        // Machine may be offline, skip
      }
    }

    res.json(allExtensions);
  } catch (err) {
    next(err);
  }
});

// POST /api/apps/deploy-script — Deploy software via a PowerShell script
router.post("/deploy-script", async (req, res, next) => {
  try {
    const { machineName, displayName, script, location } = req.body;
    const runCommandName = `Install-${displayName?.replace(/\s+/g, "-") || Date.now()}`;

    const result = await armRequest(
      "PUT",
      scopedPath(`providers/${PROVIDER}/${machineName}/runCommands/${runCommandName}`),
      {
        location: location || "eastus",
        properties: {
          source: {
            script: Array.isArray(script) ? script.join("\n") : script,
          },
          asyncExecution: true,
          timeoutInSeconds: 3600,
        },
      },
      "2024-07-10"
    );

    res.json({
      success: true,
      appId: result.id,
      displayName,
      machine: machineName,
      provisioningState: result.properties?.provisioningState || "Accepted",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/apps/deploy-winget — Install an app via WinGet on Arc machine
router.post("/deploy-winget", async (req, res, next) => {
  try {
    const { machineName, packageId, location } = req.body;
    const runCommandName = `WinGet-${packageId?.replace(/\./g, "-") || Date.now()}`;

    const script = DIRECT_INSTALL[packageId]
      || `winget install --id ${packageId} --accept-source-agreements --accept-package-agreements --silent`;

    const result = await armRequest(
      "PUT",
      scopedPath(`providers/${PROVIDER}/${machineName}/runCommands/${runCommandName}`),
      {
        location: location || "eastus",
        properties: {
          source: { script },
          asyncExecution: true,
          timeoutInSeconds: 3600,
        },
      },
      "2024-07-10"
    );

    res.json({
      success: true,
      appId: result.id,
      packageId,
      machine: machineName,
      provisioningState: result.properties?.provisioningState || "Accepted",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/:machineName/:runCommandName/status — Check run command status
router.get("/:machineName/:runCommandName/status", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(
        `providers/${PROVIDER}/${req.params.machineName}/runCommands/${req.params.runCommandName}`
      ),
      null,
      "2024-07-10"
    );

    res.json({
      name: data.name,
      provisioningState: data.properties?.provisioningState,
      executionState: data.properties?.instanceView?.executionState || null,
      output: data.properties?.instanceView?.output || null,
      error: data.properties?.instanceView?.error || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
