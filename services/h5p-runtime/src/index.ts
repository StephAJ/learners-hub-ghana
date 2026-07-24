import { createServer } from "./server.js";
import { loadRuntimeConfig } from "./config.js";

const config = loadRuntimeConfig();
const app = await createServer(config);
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "runtime.started",
      port: config.port,
      service: "learners-hub-h5p",
    }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error(
          JSON.stringify({
            event: "runtime.shutdown_failed",
            message: error.message,
          }),
        );
        process.exitCode = 1;
      }
    });
  });
}
