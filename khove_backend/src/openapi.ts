import { env } from "@backend/env";

/**
 * OpenAPI 3.0 spec for the Khove backend REST surface (served at /docs).
 *
 * Scope: the Express REST + OAuth + webhook routes. The tRPC surface (`/trpc/*`),
 * the Inngest serve handler (`/api/inngest`), and the socket.io gateway are NOT
 * OpenAPI-shaped and are described in the info section instead.
 */

const bearer = [{ bearerAuth: [] as string[] }];
const workspaceIdBody = {
  type: "object",
  required: ["workspaceId"],
  properties: { workspaceId: { type: "string" } },
} as const;
const okResponse = (desc: string) => ({
  description: desc,
  content: { "application/json": { schema: { type: "object" } } },
});

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Khove Backend API",
    version: "0.1.0",
    description:
      "REST + OAuth + webhook surface of the Khove Express backend.\n\n" +
      "Auth: send the Clerk session token as `Authorization: Bearer <token>` " +
      "(the frontend forwards it). Workspace-scoped tasks/chat pass `workspaceId` " +
      "in the body; tRPC calls use the `x-workspace-id` header.\n\n" +
      "Not documented here (non-REST): `POST/GET /trpc/*` (tRPC, superjson), " +
      "`/api/inngest` (Inngest serve), and the socket.io realtime gateway.",
  },
  servers: [{ url: env.BACKEND_URL }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT",
        description: "Clerk session token" },
    },
  },
  paths: {
    "/healthz": {
      get: {
        summary: "Health check", security: [],
        responses: { "200": okResponse("Service healthy — `{ ok: true }`") },
      },
    },
    "/api/chat": {
      post: {
        summary: "AI conversation turn", security: bearer,
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", required: ["message", "workspaceId"],
            properties: {
              message: { type: "string", maxLength: 4000 },
              conversationId: { type: "string" },
              workspaceId: { type: "string" },
            },
          } } },
        },
        responses: {
          "200": okResponse("`{ blocked, response, conversationId?, model? }` (blocked:true on usage limit)"),
          "400": okResponse("Validation error"), "401": okResponse("Unauthorized"),
          "403": okResponse("Not a workspace member"),
        },
      },
    },
    "/api/tasks": {
      post: {
        summary: "Create a task", security: bearer,
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", required: ["title", "workspaceId"],
            properties: {
              title: { type: "string" }, workspaceId: { type: "string" },
              statusId: { type: "string" },
              priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"] },
              dueDate: { type: "string", format: "date-time" },
              description: { type: "string" },
              syncToGoogle: { type: "boolean" },
            },
          } } },
        },
        responses: { "201": okResponse("`{ id }`"), "400": okResponse("Bad request"),
          "401": okResponse("Unauthorized"), "403": okResponse("Forbidden") },
      },
    },
    "/api/tasks/{id}/status": {
      patch: {
        summary: "Update task status", security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["statusId"], properties: { statusId: { type: "string" } } } } } },
        responses: { "200": okResponse("`{ ok: true }`"), "404": okResponse("Not found (or not owner)") },
      },
    },
    "/api/tasks/{id}/priority": {
      patch: {
        summary: "Update task priority", security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["priority"],
          properties: { priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"] } } } } } },
        responses: { "200": okResponse("`{ ok: true }`"), "404": okResponse("Not found") },
      },
    },
    "/api/tasks/{id}/due-date": {
      patch: {
        summary: "Update task due date (adjusts linked GCal meeting)", security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["dueDate"],
          properties: { dueDate: { type: "string", format: "date-time" } } } } } },
        responses: { "200": okResponse("`{ ok: true }`"), "404": okResponse("Not found") },
      },
    },
    "/api/onboarding": {
      post: {
        summary: "Set personal-workspace slug + gradient", security: bearer,
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["username"],
          properties: { username: { type: "string" }, gradient: { type: "string" } } } } } },
        responses: { "200": okResponse("`{ success, slug }`"), "409": okResponse("Username taken") },
      },
    },
    "/api/integrations/github/connect": {
      get: {
        summary: "Start GitHub OAuth (returns the URL to redirect to)", security: bearer,
        parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": okResponse("`{ url }` — client redirects the browser to it"),
          "403": okResponse("Admin only") },
      },
    },
    "/api/integrations/github/callback": {
      get: {
        summary: "GitHub OAuth callback (browser redirect target)", security: [],
        parameters: [
          { name: "code", in: "query", schema: { type: "string" } },
          { name: "state", in: "query", schema: { type: "string" } },
        ],
        responses: { "302": { description: "Redirects to the frontend workspace GitHub page" } },
      },
    },
    "/api/integrations/github/disconnect": {
      post: {
        summary: "Disconnect GitHub (admin)", security: bearer,
        requestBody: { required: true, content: { "application/json": { schema: workspaceIdBody } } },
        responses: { "200": okResponse("`{ success: true }`"), "403": okResponse("Admin only"),
          "404": okResponse("Not connected") },
      },
    },
    "/api/integrations/google/connect": {
      get: {
        summary: "Start Google Calendar OAuth (returns the URL)", security: bearer,
        parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": okResponse("`{ url }`"), "403": okResponse("Admin only") },
      },
    },
    "/api/integrations/google/callback": {
      get: {
        summary: "Google OAuth callback (browser redirect target)", security: [],
        responses: { "302": { description: "Redirects to the frontend planner" } },
      },
    },
    "/api/integrations/google/disconnect": {
      post: {
        summary: "Disconnect Google Calendar (admin)", security: bearer,
        requestBody: { required: true, content: { "application/json": { schema: workspaceIdBody } } },
        responses: { "200": okResponse("`{ success: true }`"), "403": okResponse("Admin only"),
          "404": okResponse("Not connected") },
      },
    },
    "/api/integrations/google/sync-status": {
      get: {
        summary: "Google Calendar sync status", security: bearer,
        parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": okResponse("`{ status: 'idle' | 'syncing' | ... }`") },
      },
    },
    "/api/webhooks/github": {
      post: {
        summary: "GitHub App webhook (HMAC-signed)", security: [],
        parameters: [{ name: "x-hub-signature-256", in: "header", schema: { type: "string" } }],
        responses: { "200": okResponse("`{ received: true }`"), "401": okResponse("Invalid signature") },
      },
    },
    "/api/webhooks/google-calendar": {
      post: {
        summary: "Google Calendar push notification", security: [],
        parameters: [
          { name: "x-goog-channel-id", in: "header", schema: { type: "string" } },
          { name: "x-goog-resource-id", in: "header", schema: { type: "string" } },
        ],
        responses: { "200": okResponse("`{ ok: true }`") },
      },
    },
    "/api/webhooks/clerk": {
      post: {
        summary: "Clerk user/session webhook (Svix-signed)", security: [],
        responses: { "200": okResponse("`{ received: true }`"), "400": okResponse("Invalid signature") },
      },
    },
  },
};
