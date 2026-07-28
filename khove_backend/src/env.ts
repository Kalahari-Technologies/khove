import "dotenv/config";

/**
 * Backend environment. Loaded once at process start (dotenv). Secrets are read
 * lazily where used; this module centralizes the server-level knobs.
 */
export const env = {
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:4000",
};
