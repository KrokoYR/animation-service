#!/usr/bin/env node

/**
 * This script clears all local Wrangler state to start fresh
 * It removes the .wrangler/state directory which contains local Durable Object and KV data
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🧹 Cleaning up local development state...");

// Define the paths to clear
const ROOT_DIR = path.resolve(__dirname, "..");
const WRANGLER_STATE_DIR = path.join(ROOT_DIR, ".wrangler", "state");
const LOCAL_PERSIST_DIR = path.join(ROOT_DIR, ".wrangler", "local-persist");

// Check if the Wrangler state directory exists
if (fs.existsSync(WRANGLER_STATE_DIR)) {
  try {
    console.log(`Removing Wrangler state directory: ${WRANGLER_STATE_DIR}`);
    fs.rmSync(WRANGLER_STATE_DIR, { recursive: true, force: true });
    console.log("✅ Wrangler state directory removed successfully");
  } catch (error) {
    console.error("❌ Error removing Wrangler state directory:", error);
  }
} else {
  console.log("ℹ️ Wrangler state directory not found - nothing to clean");
}

// Check if the local-persist directory exists
if (fs.existsSync(LOCAL_PERSIST_DIR)) {
  try {
    console.log(`Removing local-persist directory: ${LOCAL_PERSIST_DIR}`);
    fs.rmSync(LOCAL_PERSIST_DIR, { recursive: true, force: true });
    console.log("✅ Local-persist directory removed successfully");
  } catch (error) {
    console.error("❌ Error removing local-persist directory:", error);
  }
} else {
  console.log("ℹ️ Local-persist directory not found - nothing to clean");
}

// Kill any running Wrangler processes
try {
  console.log("Stopping any running Wrangler processes...");
  if (process.platform === "win32") {
    execSync("taskkill /f /im wrangler.exe", { stdio: "ignore" });
  } else {
    execSync("pkill -f wrangler || true", { stdio: "ignore" });
  }
  console.log("✅ All Wrangler processes stopped");
} catch (error) {
  console.log("ℹ️ No running Wrangler processes found");
}

console.log("\n🎉 Local state reset complete!");
console.log("You can now start the development server with a clean state:");
console.log("npm run dev");
