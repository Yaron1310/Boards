
import { onRequest } from "firebase-functions/v2/https";
import { onInit } from "firebase-functions/v2/core";
import { setGlobalOptions } from "firebase-functions/v2";
import { createApp } from "./server.js";
import { seedDefaultData } from "./db/seed.js";
import * as logger from "firebase-functions/logger";
import type { Application } from 'express';

// Define secrets the function needs to run.
// IMPORTANT: All secrets listed here MUST exist in your Google Cloud Secret Manager.
// Firebase Functions v2 secrets configuration expects an array of strings.
//
// If the deployment fails with "Secret not found", ensure you have run:
// firebase functions:secrets:set SECRET_NAME
const secrets = [
    "JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
    "FRONTEND_URL",
    // "BACKEND_API_URL_FOR_CALLBACKS", // This secret is optional and should not be required for deployment.
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM_NAME",
    // Microsoft Auth — disabled until secrets are provisioned
    // "MICROSOFT_CLIENT_ID",
    // "MICROSOFT_CLIENT_SECRET",
    // "MICROSOFT_CALLBACK_URL",
    // reCAPTCHA Enterprise — disabled until secrets are provisioned
    // "RECAPTCHA_API_KEY",
    // "RECAPTCHA_PROJECT_ID",
    // "RECAPTCHA_SITE_KEY",
];

// Set global options for the function.
setGlobalOptions({
  secrets: secrets,
  region: 'us-central1' // Or your preferred region
});

// Run the seed on every cold start, guaranteed to complete before any request is handled.
onInit(async () => {
  logger.info("Cold start: running database seed check...");
  try {
    await seedDefaultData();
    logger.info("Cold start: seed check complete.");
  } catch (error) {
    logger.error("Cold start: seed failed. Admin user may not exist.", error);
  }
});

// A promise to ensure the app is initialized only once. This prevents race conditions.
let appInitializationPromise: Promise<Application> | null = null;

// This is the main Cloud Function entry point.
export const api = onRequest({ invoker: 'public', timeoutSeconds: 300 }, async (request, response) => {
  if (!appInitializationPromise) {
    logger.info("Initializing Express app instance for the first time...");
    appInitializationPromise = createApp();
  }

  try {
    const appInstance = await (appInitializationPromise as Promise<Application>);
    logger.info("Express app instance is ready. Handling request.");
    return appInstance(request as any, response as any);
  } catch (error) {
    logger.error("Fatal error during Express app initialization:", error);
    // Reset the promise on failure so the next request to this instance can retry initialization.
    appInitializationPromise = null;
    (response as any).status(500).send("Internal Server Error: Could not initialize server.");
    return;
  }
});
