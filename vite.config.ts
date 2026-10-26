import { defineConfig } from "vite";

// Relative assets allow the same build to run offline inside the portable app.
export default defineConfig({ base: "./" });
