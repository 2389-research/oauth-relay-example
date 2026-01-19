// ABOUTME: Cross-platform browser opening utility
// ABOUTME: Opens URLs in the default browser on macOS, Windows, and Linux

import { spawn } from "child_process";
import os from "os";

/**
 * Opens a URL in the system's default browser.
 * Works on macOS, Windows, and Linux.
 */
export async function openBrowser(url: string): Promise<void> {
  const platform = os.platform();

  let command: string;
  let args: string[];

  switch (platform) {
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      // Linux and others
      command = "xdg-open";
      args = [url];
      break;
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });

    // Don't wait for the browser process
    child.unref();

    // Resolve after a short delay to allow the command to start
    // The browser might still be opening, but we don't need to wait
    setTimeout(resolve, 500);

    child.on("error", (err) => {
      // Log the error but don't reject - the browser might still open
      console.error(`[browser] Failed to open browser: ${err.message}`);
      // Still resolve - user might be able to manually navigate
      resolve();
    });
  });
}
