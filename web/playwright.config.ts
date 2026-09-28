import { defineConfig } from "@playwright/test";
import path from "path";

/**
 * End-to-end voice test: real browser, real session route, real Gemini Live
 * call, with Chrome's fake microphone playing e2e/fixtures/caller.wav
 * (run e2e/make-audio.sh first). Needs web/.env.local with GEMINI_API_KEY.
 *
 * Local:   npm run build && npm run test:e2e
 * Deploy:  E2E_BASE_URL=https://<preview>.vercel.app npm run test:e2e
 */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external || "http://localhost:3100",
    permissions: ["microphone"],
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${path.resolve(__dirname, "e2e/fixtures/caller.wav")}`,
        "--autoplay-policy=no-user-gesture-required",
        // Software WebGL so the orb renders in headless Chrome like on a real device.
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: external
    ? undefined
    : {
        command: "npx next start -p 3100",
        port: 3100,
        reuseExistingServer: false,
        // No emails from test calls.
        env: { RESEND_API_KEY: "" },
      },
});
