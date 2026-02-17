const express = require("express");
const cors = require("cors");

const devicesRouter = require("./routes/devices");
const appsRouter = require("./routes/apps");
const updatesRouter = require("./routes/updates");
const complianceRouter = require("./routes/compliance");
const configRouter = require("./routes/config");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Intune Command Center" });
});

// Route handlers
app.use("/api/devices", devicesRouter);
app.use("/api/apps", appsRouter);
app.use("/api/updates", updatesRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/config", configRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Intune Command Center API running on port ${PORT}`);
});
