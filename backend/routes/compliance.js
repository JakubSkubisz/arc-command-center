const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/compliance — Compliance summary
router.get("/", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceManagement/managedDevices?$select=deviceName,complianceState,userDisplayName,lastSyncDateTime,operatingSystem,osVersion"
    );

    const summary = { compliant: 0, noncompliant: 0, inGracePeriod: 0 };
    const devices = data.value.map((d) => {
      if (d.complianceState === "compliant") summary.compliant++;
      else if (d.complianceState === "noncompliant") summary.noncompliant++;
      else if (d.complianceState === "inGracePeriod") summary.inGracePeriod++;
      return d;
    });

    res.json({ summary, devices });
  } catch (err) {
    next(err);
  }
});

// GET /api/compliance/policies — List compliance policies
router.get("/policies", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceManagement/deviceCompliancePolicies"
    );
    res.json(data.value);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
