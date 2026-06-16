import http from "node:http";
import { config } from "../config/index.js";
import { register } from "./metrics.js";

export function startMetricsServer(): http.Server {
  const port = Number(config.METRICS_PORT || 4000);

  const server = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
      return;
    }

    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`Metrics server listening on port ${port}`);
  });

  return server;
}
