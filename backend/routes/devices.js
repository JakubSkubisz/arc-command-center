const { Router } = require("express");
const { armRequest, scopedPath } = require("../lib/azure");
const router = Router();

const PROVIDER = "Microsoft.HybridCompute/machines";

// GET /api/devices — List all Arc-connected machines
router.get("/", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(`providers/${PROVIDER}`)
    );
    res.json(
      (data.value || []).map((m) => ({
        id: m.name,
        resourceId: m.id,
        name: m.properties.displayName || m.name,
        user: m.properties.lastStatusChange ? "—" : "—",
        os: `${m.properties.osName || ""} ${m.properties.osVersion || ""}`.trim(),
        status: m.properties.status, // Connected, Disconnected, Error
        lastSync: m.properties.lastStatusChange,
        model: m.properties.model || "—",
        serial: m.properties.serialNumber || "—",
        ownership: "corporate",
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/devices/:name — Get single machine details
router.get("/:name", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(`providers/${PROVIDER}/${req.params.name}`)
    );
    res.json({
      id: data.name,
      resourceId: data.id,
      name: data.properties.displayName || data.name,
      os: `${data.properties.osName || ""} ${data.properties.osVersion || ""}`.trim(),
      status: data.properties.status,
      lastSync: data.properties.lastStatusChange,
      model: data.properties.model || "—",
      serial: data.properties.serialNumber || "—",
      agentVersion: data.properties.agentVersion,
      machineFqdn: data.properties.machineFqdn,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:name/run-command — Execute a script on the machine
router.post("/:name/run-command", async (req, res, next) => {
  try {
    const { script } = req.body;
    const machineName = req.params.name;
    const runCommandName = `RunCommand-${Date.now()}`;

    const result = await armRequest(
      "PUT",
      scopedPath(`providers/${PROVIDER}/${machineName}/runCommands/${runCommandName}`),
      {
        location: req.body.location || "eastus",
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
      action: "run-command",
      machine: machineName,
      runCommandName,
      provisioningState: result.properties?.provisioningState || "Accepted",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:name/reboot — Restart machine via run command
router.post("/:name/reboot", async (req, res, next) => {
  try {
    const machineName = req.params.name;
    const runCommandName = `Reboot-${Date.now()}`;

    await armRequest(
      "PUT",
      scopedPath(`providers/${PROVIDER}/${machineName}/runCommands/${runCommandName}`),
      {
        location: req.body.location || "eastus",
        properties: {
          source: {
            script: "Restart-Computer -Force",
          },
          asyncExecution: true,
          timeoutInSeconds: 60,
        },
      },
      "2024-07-10"
    );

    res.json({ success: true, action: "reboot", machine: machineName });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
