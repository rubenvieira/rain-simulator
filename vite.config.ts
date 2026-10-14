import { defineConfig } from "vite";

// The Play release workflow supplies --base=/rain-simulator/ at build time.
export default defineConfig({
  base: "/",
  server: { host: true, port: 8080 },
});
