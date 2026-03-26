const express = require('express');

const router = express.Router();

router.get('/metrics', (req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const memory = process.memoryUsage();

  return res.status(200).json({
    uptimeSeconds,
    memoryRss: memory.rss,
    heapUsed: memory.heapUsed,
    requestId: req.requestId || null,
    timestamp: new Date().toISOString()
  });
});

router.get('/health/detail', (_req, res) => {
  return res.status(200).json({
    service: 'smart-attendance-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
    backupPlan: {
      strategy: 'Daily Supabase SQL dump + weekly full backup',
      restoreRtoMinutes: 60,
      restoreRpoHours: 24
    }
  });
});

module.exports = router;
