const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/apps — List all apps in Intune
router.get("/", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/deviceAppManagement/mobileApps?$select=id,displayName,publisher,createdDateTime"
    );
    res.json(data.value);
  } catch (err) {
    next(err);
  }
});

// POST /api/apps/deploy-store — Deploy a Microsoft Store (WinGet) app
router.post("/deploy-store", async (req, res, next) => {
  try {
    const { displayName, packageIdentifier, groupId } = req.body;

    // Step 1: Create the app
    const app = await graphRequest(
      "POST",
      "/deviceAppManagement/mobileApps",
      {
        "@odata.type": "#microsoft.graph.winGetApp",
        displayName,
        description: `Deployed via Intune Command Center`,
        publisher: "Team 2 IT",
        packageIdentifier,
        installExperience: { runAsAccount: "system" },
      },
      true // uses /beta endpoint
    );

    // Step 2: Assign to group
    await graphRequest(
      "POST",
      `/deviceAppManagement/mobileApps/${app.id}/assignments`,
      {
        mobileAppAssignments: [
          {
            "@odata.type": "#microsoft.graph.mobileAppAssignment",
            intent: "required",
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, appId: app.id, displayName });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/:id/status — Check app install status
router.get("/:id/status", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      `/deviceAppManagement/mobileApps/${req.params.id}/deviceStatuses`,
      null,
      true
    );
    res.json(data.value);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
