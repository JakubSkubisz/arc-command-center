const { Router } = require("express");
const { armRequest, scopedPath, subPath } = require("../lib/azure");
const router = Router();

const PROVIDER = "Microsoft.HybridCompute/machines";

// GET /api/config/machines — List Arc machines (for targeting)
router.get("/machines", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(`providers/${PROVIDER}`)
    );
    res.json(
      (data.value || []).map((m) => ({
        id: m.name,
        name: m.properties.displayName || m.name,
        status: m.properties.status,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/config/extensions/:machineName — List extensions on a machine
router.get("/extensions/:machineName", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(
        `providers/${PROVIDER}/${req.params.machineName}/extensions`
      ),
      null,
      "2024-07-10"
    );
    res.json(
      (data.value || []).map((e) => ({
        name: e.name,
        publisher: e.properties?.publisher,
        type: e.properties?.type,
        provisioningState: e.properties?.provisioningState,
        version: e.properties?.typeHandlerVersion,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// PUT /api/config/extension — Install an extension on a machine
router.put("/extension", async (req, res, next) => {
  try {
    const { machineName, extensionName, publisher, type, version, settings, location } =
      req.body;

    const result = await armRequest(
      "PUT",
      scopedPath(
        `providers/${PROVIDER}/${machineName}/extensions/${extensionName}`
      ),
      {
        location: location || "eastus",
        properties: {
          publisher,
          type,
          typeHandlerVersion: version || "1.0",
          settings: settings || {},
        },
      },
      "2024-07-10"
    );

    res.json({
      success: true,
      extensionId: result.id,
      provisioningState: result.properties?.provisioningState,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/config/policy — Assign an Azure Policy to the resource group
router.post("/policy", async (req, res, next) => {
  try {
    const { displayName, policyDefinitionId, parameters } = req.body;
    const assignmentName = `cc-${Date.now()}`;

    const result = await armRequest(
      "PUT",
      scopedPath(
        `providers/Microsoft.Authorization/policyAssignments/${assignmentName}`
      ),
      {
        properties: {
          displayName: displayName || "Policy - Command Center",
          policyDefinitionId,
          parameters: parameters || {},
        },
      },
      "2022-06-01"
    );

    res.json({
      success: true,
      assignmentId: result.id,
      displayName: result.properties?.displayName,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/config/extension — Remove an extension from a machine
router.delete("/extension", async (req, res, next) => {
  try {
    const { machineName, extensionName } = req.body;

    await armRequest(
      "DELETE",
      scopedPath(
        `providers/${PROVIDER}/${machineName}/extensions/${extensionName}`
      ),
      null,
      "2024-07-10"
    );

    res.json({ success: true, action: "delete", extensionName, machine: machineName });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
