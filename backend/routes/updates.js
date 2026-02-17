const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// POST /api/updates/quality — Push quality (security) update
router.post("/quality", async (req, res, next) => {
  try {
    const { displayName, groupId, releaseDate, daysUntilReboot } = req.body;

    const profile = await graphRequest(
      "POST",
      "/deviceManagement/windowsQualityUpdateProfiles",
      {
        "@odata.type": "#microsoft.graph.windowsQualityUpdateProfile",
        displayName: displayName || "Security Update - Command Center",
        description: "Pushed via Intune Command Center",
        expeditedUpdateSettings: {
          qualityUpdateRelease: releaseDate,
          daysUntilForcedReboot: daysUntilReboot || 2,
        },
      },
      true
    );

    await graphRequest(
      "POST",
      `/deviceManagement/windowsQualityUpdateProfiles/${profile.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, profileId: profile.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/updates/feature — Push feature update
router.post("/feature", async (req, res, next) => {
  try {
    const { displayName, groupId, featureUpdateVersion } = req.body;

    const profile = await graphRequest(
      "POST",
      "/deviceManagement/windowsFeatureUpdateProfiles",
      {
        "@odata.type": "#microsoft.graph.windowsFeatureUpdateProfile",
        displayName: displayName || "Feature Update - Command Center",
        description: "Pushed via Intune Command Center",
        featureUpdateVersion: featureUpdateVersion || "Windows 11, version 24H2",
      },
      true
    );

    await graphRequest(
      "POST",
      `/deviceManagement/windowsFeatureUpdateProfiles/${profile.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      },
      true
    );

    res.json({ success: true, profileId: profile.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/updates/ring — Create Windows Update for Business ring
router.post("/ring", async (req, res, next) => {
  try {
    const { displayName, groupId, qualityDeferral, featureDeferral } = req.body;

    const ring = await graphRequest(
      "POST",
      "/deviceManagement/deviceConfigurations",
      {
        "@odata.type":
          "#microsoft.graph.windowsUpdateForBusinessConfiguration",
        displayName: displayName || "Update Ring - Command Center",
        qualityUpdatesDeferralPeriodInDays: qualityDeferral || 0,
        featureUpdatesDeferralPeriodInDays: featureDeferral || 0,
        automaticUpdateMode: "autoInstallAtMaintenanceTime",
        businessReadyUpdatesOnly: "all",
      }
    );

    await graphRequest(
      "POST",
      `/deviceManagement/deviceConfigurations/${ring.id}/assignments`,
      {
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId,
            },
          },
        ],
      }
    );

    res.json({ success: true, ringId: ring.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
