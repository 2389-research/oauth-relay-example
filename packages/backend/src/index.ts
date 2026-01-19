// ABOUTME: Firebase Functions entry point
// ABOUTME: Exports Express app as Cloud Function with MCP tool endpoints

import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./app.js";

const app = createApp();

// Export for Firebase Functions
export const api = onRequest({ cors: true }, app);
