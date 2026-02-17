const { Router } = require("express");
const { graphRequest } = require("../lib/graph");
const router = Router();

// GET /api/config/groups — List Entra ID groups for targeting
router.get("/groups", async (req, res, next) => {
  try {
    const data = await graphRequest(
      "GET",
      "/groups?$select=id,displayName&$top=50"
    );
    res.json(data.value.map((g) => ({ id: g.id, name: g.displayName })));
  } catch (err) {
    next(err);
  }
});

// POST /api/config/profile — Create a configuration profile
router.post("/profile", async (req, res, next) => {
  try {
    const { displayName, settings, groupId } = req.body;

    const profile = await graphRequest(
      "POST",
      "/deviceManagement/configurationPolicies",
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationPolicy",
        name: displayName,
        description: "Created via Intune Command Center",
        platforms: "windows10",
        technologies: "mdm",
        settings,
      },
      true
    );

    await graphRequest(
      "POST",
      `/deviceManagement/configurationPolicies/${profile.id}/assignments`,
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

module.exports = router;
