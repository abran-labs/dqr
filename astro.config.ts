import react from "@astrojs/react";
import { defineConfig } from "astro/config";

// Fully static client-side app — no adapter, no server output.
export default defineConfig({
  integrations: [react()],
});
