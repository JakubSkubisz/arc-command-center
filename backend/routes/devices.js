const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/devices — List all managed devices
router.get("/", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceManagement/managedDevices?$select=id,deviceName,userDisplayName,operatingSystem,osVersion,complianceState,lastSyncDateTime,model,serialNumber,managedDeviceOwnerType"
    );
    res.json(
      data.value.map((d) => ({
        id: d.id,
        name: d.deviceName,
        user: d.userDisplayName,
        os: `${d.operatingSystem} ${d.osVersion}`,
        status: d.complianceState,
        lastSync: d.lastSyncDateTime,
        model: d.model,
        serial: d.serialNumber,
        ownership: d.managedDeviceOwnerType,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/sync — Trigger device sync
router.post("/:id/sync", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/syncDevice`
    );
    res.json({ success: true, action: "sync", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/reboot — Restart device
router.post("/:id/reboot", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/rebootNow`
    );
    res.json({ success: true, action: "reboot", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/wipe — Factory reset (destructive!)
router.post("/:id/wipe", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/wipe`,
      { keepUserData: req.body.keepUserData || false }
    );
    res.json({ success: true, action: "wipe", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/:id/retire — Remove company data only
router.post("/:id/retire", async (req, res, next) => {
  try {
    await graphRequest(
      "POST",
      `/deviceManagement/managedDevices/${req.params.id}/retire`
    );
    res.json({ success: true, action: "retire", deviceId: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
