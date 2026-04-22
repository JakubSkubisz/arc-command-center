const { Router } = require("express");
const { armRequest, scopedPath } = require("../lib/azure");
const router = Router();

const PROVIDER = "Microsoft.HybridCompute/machines";

// GET /api/compliance — Machine health summary
router.get("/", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(`providers/${PROVIDER}`)
    );

    const summary = { connected: 0, disconnected: 0, error: 0 };
    const devices = (data.value || []).map((m) => {
      const status = (m.properties.status || "").toLowerCase();
      if (status === "connected") summary.connected++;
      else if (status === "disconnected") summary.disconnected++;
      else summary.error++;

      return {
        name: m.properties.displayName || m.name,
        status: m.properties.status,
        os: `${m.properties.osName || ""} ${m.properties.osVersion || ""}`.trim(),
        lastSync: m.properties.lastStatusChange,
        agentVersion: m.properties.agentVersion,
      };
    });

    res.json({ summary, devices });
  } catch (err) {
    next(err);
  }
});

// GET /api/compliance/policies — List Azure Policy assignments in the resource group
router.get("/policies", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath("providers/Microsoft.Authorization/policyAssignments"),
      null,
      "2022-06-01"
    );
    res.json(
      (data.value || []).map((p) => ({
        id: p.id,
        name: p.name,
        displayName: p.properties?.displayName || p.name,
        policyDefinitionId: p.properties?.policyDefinitionId,
        scope: p.properties?.scope,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/compliance/:machineName — Get guest configuration status for a machine
router.get("/:machineName", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(
        `providers/${PROVIDER}/${req.params.machineName}/providers/Microsoft.GuestConfiguration/guestConfigurationAssignments`
      ),
      null,
      "2022-01-25"
    );

    res.json(
      (data.value || []).map((a) => ({
        name: a.name,
        complianceStatus: a.properties?.complianceStatus,
        lastComplianceStatusChecked: a.properties?.lastComplianceStatusChecked,
        configurationName: a.properties?.guestConfiguration?.name,
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
