const { Router } = require("express");
const { armRequest, scopedPath, subPath } = require("../lib/azure");
const router = Router();

const PROVIDER = "Microsoft.HybridCompute/machines";

// POST /api/updates/assess — Trigger an update assessment on a machine
router.post("/assess", async (req, res, next) => {
  try {
    const { machineName } = req.body;

    const result = await armRequest(
      "POST",
      scopedPath(
        `providers/${PROVIDER}/${machineName}/assessPatches`
      ),
      null,
      "2024-07-10"
    );

    res.json({
      success: true,
      action: "assess",
      machine: machineName,
      status: result.status || "Accepted",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/updates/install — Install updates on a machine
router.post("/install", async (req, res, next) => {
  try {
    const {
      machineName,
      maximumDuration,
      rebootSetting,
      classifications,
    } = req.body;

    const result = await armRequest(
      "POST",
      scopedPath(
        `providers/${PROVIDER}/${machineName}/installPatches`
      ),
      {
        maximumDuration: maximumDuration || "PT2H",
        rebootSetting: rebootSetting || "IfRequired", // IfRequired, Never, Always
        windowsParameters: {
          classificationsToInclude: classifications || [
            "Critical",
            "Security",
            "UpdateRollUp",
          ],
        },
      },
      "2024-07-10"
    );

    res.json({
      success: true,
      action: "install",
      machine: machineName,
      status: result.status || "Accepted",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/updates/:machineName — Get latest patch assessment results
router.get("/:machineName", async (req, res, next) => {
  try {
    const data = await armRequest(
      "GET",
      scopedPath(
        `providers/${PROVIDER}/${req.params.machineName}`
      ),
      null,
      "2024-07-10"
    );

    const patchStatus = data.properties?.osProfile?.windowsConfiguration?.patchSettings || {};

    res.json({
      machine: req.params.machineName,
      assessmentMode: patchStatus.assessmentMode || "Unknown",
      patchMode: patchStatus.patchMode || "Unknown",
      status: data.properties?.status,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/updates/schedule — Create a maintenance configuration for scheduled updates
router.post("/schedule", async (req, res, next) => {
  try {
    const {
      configName,
      location,
      startDateTime,
      duration,
      recurEvery,
      timeZone,
    } = req.body;

    const result = await armRequest(
      "PUT",
      subPath(
        `providers/Microsoft.Maintenance/maintenanceConfigurations/${configName || "update-schedule"}`
      ),
      {
        location: location || "eastus",
        properties: {
          maintenanceScope: "InGuestPatch",
          installPatches: {
            rebootSetting: "IfRequired",
            windowsParameters: {
              classificationsToInclude: ["Critical", "Security"],
            },
          },
          maintenanceWindow: {
            startDateTime: startDateTime || new Date().toISOString(),
            duration: duration || "02:00",
            recurEvery: recurEvery || "1Day",
            timeZone: timeZone || "Eastern Standard Time",
          },
        },
      },
      "2023-04-01"
    );

    res.json({
      success: true,
      configId: result.id,
      configName: result.name,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
