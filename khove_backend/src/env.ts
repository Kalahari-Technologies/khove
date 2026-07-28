import dotenv from "dotenv";

// Load `.env.local` first (development, gitignored) then `.env`, matching the
// Next.js monolith's precedence. dotenv never overrides an already-set var, so
// `.env.local` wins over `.env`, and real OS env vars (staging/prod) win over both.
// Requires cwd = khove_backend (the npm workspace scripts run there).
dotenv.config({ path: ".env.local" });
dotenv.config();

/**
 * Backend environment. Loaded once at process start (dotenv). Secrets are read
 * lazily where used; this module centralizes the server-level knobs.
 */
export const env = {
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:4000",
};
