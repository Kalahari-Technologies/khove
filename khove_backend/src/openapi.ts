import { env } from "@backend/env";

/**
 * OpenAPI 3.0 spec for the Khove backend (served at /docs, raw at /openapi.json).
 *
 * Covers the full surface, grouped by tag:
 *   - REST routes (Express): chat, tasks, onboarding, integrations, webhooks, health.
 *   - tRPC procedures (`/trpc/<procedure>`): auth/session, workspaces, members,
 *     tasks, integrations, conversations, calendar.
 *
 * tRPC transport note: queries are GET with a superjson-encoded `input` query
 * param; mutations are POST with a superjson-wrapped JSON body (e.g. `{ "json": {...} }`).
 * Workspace-scoped procedures require the `x-workspace-id` header. All non-public
 * endpoints require `Authorization: Bearer <Clerk session token>`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

const jsonObj = { "application/json": { schema: { type: "object" } } };
const res = (description: string): Obj => ({ description, content: jsonObj });
const PUBLIC: Obj[] = []; // security override → no auth

const RESP_AUTH = {
  "200": res("Success"),
  "401": res("Unauthorized — missing/invalid Clerk token"),
};
const RESP_WS = {
  ...RESP_AUTH,
  "403": res("Forbidden — no workspace context or insufficient role"),
};

const wsHeader = { $ref: "#/components/parameters/WorkspaceIdHeader" };
const trpcInputQuery = {
  name: "input",
  in: "query",
  required: false,
  description: "superjson-encoded procedure input (tRPC-over-HTTP)",
  schema: { type: "string" },
};
const trpcBody = {
  required: false,
  description: "superjson-wrapped input, e.g. `{ \"json\": { ... } }`",
  content: jsonObj,
};

// ── tRPC procedure catalogue: [procedure, method, tag, summary, workspaceScoped] ──
const trpcProcs: [string, "get" | "post", string, string, boolean][] = [
  ["workspace.me", "get", "Auth & Session", "Current user + personal workspace slug", false],
  ["workspace.list", "get", "Workspaces", "List the workspaces the user belongs to", false],
  ["workspace.getBySlug", "get", "Workspaces", "Get a workspace by slug (+ current role)", false],
  ["workspace.create", "post", "Workspaces", "Create a workspace (seeds default statuses)", false],
  ["workspace.update", "post", "Workspaces", "Update workspace name/settings (admin)", true],
  ["workspace.delete", "post", "Workspaces", "Delete workspace (owner; not personal)", true],
  ["workspace.leave", "post", "Workspaces", "Leave a workspace (non-owner)", true],
  ["workspace.listMembers", "get", "Members", "List workspace members", true],
  ["workspace.inviteMember", "post", "Members", "Invite a member by email (admin)", true],
  ["workspace.removeMember", "post", "Members", "Remove a member (admin; not owner)", true],
  ["workspace.updateMemberRole", "post", "Members", "Update a member's role (admin)", true],
  ["task.list", "get", "Tasks", "List tasks (filter by status/source/hasDueDate)", true],
  ["task.get", "get", "Tasks", "Get a task by id (with status + assignees)", true],
  ["task.create", "post", "Tasks", "Create a task (dedupes by externalId)", true],
  ["task.update", "post", "Tasks", "Update a task's mutable fields", true],
  ["task.assign", "post", "Tasks", "Assign users to a task", true],
  ["task.delete", "post", "Tasks", "Soft-delete a task (status → CANCELLED)", true],
  ["workflowStatus.list", "get", "Tasks", "List workflow statuses (own or system defaults)", true],
  ["integration.list", "get", "Integrations", "List active integrations (safe fields, no tokens)", true],
  ["integration.get", "get", "Integrations", "Get one integration by provider (no tokens)", true],
  ["integration.syncStatus", "get", "Integrations", "Google Calendar sync status", true],
  ["conversation.list", "get", "Conversations & Chat", "Recent conversations (sidebar)", true],
  ["conversation.get", "get", "Conversations & Chat", "Get a conversation (with messages)", true],
  ["calendarEntry.list", "get", "Calendar", "List external calendar entries (planner)", true],
];

function trpcOperation(
  method: "get" | "post",
  tag: string,
  summary: string,
  ws: boolean
): Obj {
  const op: Obj = {
    tags: [tag],
    summary,
    parameters: [
      ...(ws ? [wsHeader] : []),
      ...(method === "get" ? [trpcInputQuery] : []),
    ],
    responses: ws ? RESP_WS : RESP_AUTH,
  };
  if (op.parameters.length === 0) delete op.parameters;
  if (method === "post") op.requestBody = trpcBody;
  return { [method]: op };
}

const trpcPaths: Obj = {};
for (const [proc, method, tag, summary, ws] of trpcProcs) {
  trpcPaths[`/trpc/${proc}`] = trpcOperation(method, tag, summary, ws);
}

// ── REST paths ──
const restPaths: Obj = {
  "/healthz": {
    get: { tags: ["Health"], summary: "Health check", security: PUBLIC,
      responses: { "200": res("`{ ok: true }`") } },
  },
  "/openapi.json": {
    get: { tags: ["Health"], summary: "This OpenAPI document", security: PUBLIC,
      responses: { "200": res("OpenAPI 3.0 spec") } },
  },
  "/api/inngest": {
    post: { tags: ["Inngest"], summary: "Inngest serve handler (also GET/PUT)", security: PUBLIC,
      description: "Inngest introspection (GET), event/step invocation (POST), and function registration (PUT). Authenticated by the Inngest signing key, not Clerk.",
      responses: { "200": res("Inngest response") } },
  },
  "/api/chat": {
    post: {
      tags: ["Conversations & Chat"], summary: "AI conversation turn",
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["message", "workspaceId"],
        properties: {
          message: { type: "string", maxLength: 4000 },
          conversationId: { type: "string" },
          workspaceId: { type: "string" },
        } } } } },
      responses: {
        "200": res("`{ blocked, response, conversationId?, model? }` (blocked:true on usage limit)"),
        "400": res("Validation error"), "401": res("Unauthorized"),
        "403": res("Not a workspace member"),
      },
    },
  },
  "/api/tasks": {
    post: {
      tags: ["Tasks"], summary: "Create a task (REST — used by the new-task form)",
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["title", "workspaceId"],
        properties: {
          title: { type: "string" }, workspaceId: { type: "string" },
          statusId: { type: "string" },
          priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"] },
          dueDate: { type: "string", format: "date-time" },
          description: { type: "string" }, syncToGoogle: { type: "boolean" },
        } } } } },
      responses: { "201": res("`{ id }`"), "400": res("Bad request"),
        "401": res("Unauthorized"), "403": res("Forbidden") },
    },
  },
  "/api/tasks/{id}/status": {
    patch: {
      tags: ["Tasks"], summary: "Update task status (REST)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["statusId"], properties: { statusId: { type: "string" } } } } } },
      responses: { "200": res("`{ ok: true }`"), "404": res("Not found / not owner") },
    },
  },
  "/api/tasks/{id}/priority": {
    patch: {
      tags: ["Tasks"], summary: "Update task priority (REST)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["priority"],
        properties: { priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"] } } } } } },
      responses: { "200": res("`{ ok: true }`"), "404": res("Not found") },
    },
  },
  "/api/tasks/{id}/due-date": {
    patch: {
      tags: ["Tasks"], summary: "Update task due date (adjusts linked GCal meeting)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["dueDate"],
        properties: { dueDate: { type: "string", format: "date-time" } } } } } },
      responses: { "200": res("`{ ok: true }`"), "404": res("Not found") },
    },
  },
  "/api/onboarding": {
    post: {
      tags: ["Onboarding"], summary: "Set personal-workspace slug + gradient",
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["username"],
        properties: { username: { type: "string" }, gradient: { type: "string" } } } } } },
      responses: { "200": res("`{ success, slug }`"), "401": res("Unauthorized"),
        "409": res("Username taken") },
    },
  },
  "/api/integrations/github/connect": {
    get: {
      tags: ["Integrations"], summary: "Start GitHub OAuth (returns the URL to redirect to)",
      parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": res("`{ url }` — client redirects the browser to it"),
        "401": res("Unauthorized"), "403": res("Admin only") },
    },
  },
  "/api/integrations/github/callback": {
    get: {
      tags: ["Integrations"], summary: "GitHub OAuth callback (browser redirect target)",
      security: PUBLIC,
      parameters: [
        { name: "code", in: "query", schema: { type: "string" } },
        { name: "state", in: "query", schema: { type: "string" } },
      ],
      responses: { "302": { description: "Redirects to the frontend workspace GitHub page" } },
    },
  },
  "/api/integrations/github/disconnect": {
    post: {
      tags: ["Integrations"], summary: "Disconnect GitHub (admin)",
      requestBody: { $ref: "#/components/requestBodies/WorkspaceIdBody" },
      responses: { "200": res("`{ success: true }`"), "403": res("Admin only"),
        "404": res("Not connected") },
    },
  },
  "/api/integrations/google/connect": {
    get: {
      tags: ["Integrations"], summary: "Start Google Calendar OAuth (returns the URL)",
      parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": res("`{ url }`"), "401": res("Unauthorized"), "403": res("Admin only") },
    },
  },
  "/api/integrations/google/callback": {
    get: {
      tags: ["Integrations"], summary: "Google OAuth callback (browser redirect target)",
      security: PUBLIC,
      responses: { "302": { description: "Redirects to the frontend planner" } },
    },
  },
  "/api/integrations/google/disconnect": {
    post: {
      tags: ["Integrations"], summary: "Disconnect Google Calendar (admin)",
      requestBody: { $ref: "#/components/requestBodies/WorkspaceIdBody" },
      responses: { "200": res("`{ success: true }`"), "403": res("Admin only"),
        "404": res("Not connected") },
    },
  },
  "/api/integrations/google/sync-status": {
    get: {
      tags: ["Integrations"], summary: "Google Calendar sync status (REST)",
      parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": res("`{ status: 'idle' | 'syncing' | ... }`") },
    },
  },
  "/api/webhooks/github": {
    post: {
      tags: ["Webhooks"], summary: "GitHub App webhook (HMAC-signed)", security: PUBLIC,
      parameters: [{ name: "x-hub-signature-256", in: "header", schema: { type: "string" } }],
      responses: { "200": res("`{ received: true }`"), "401": res("Invalid signature") },
    },
  },
  "/api/webhooks/google-calendar": {
    post: {
      tags: ["Webhooks"], summary: "Google Calendar push notification", security: PUBLIC,
      parameters: [
        { name: "x-goog-channel-id", in: "header", schema: { type: "string" } },
        { name: "x-goog-resource-id", in: "header", schema: { type: "string" } },
      ],
      responses: { "200": res("`{ ok: true }`") },
    },
  },
  "/api/webhooks/clerk": {
    post: {
      tags: ["Webhooks"], summary: "Clerk user/session webhook (Svix-signed)", security: PUBLIC,
      description: "Syncs Clerk users → DB, seeds the personal workspace, and dispatches welcome/OTP/new-device emails.",
      responses: { "200": res("`{ received: true }`"), "400": res("Invalid signature") },
    },
  },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Khove Backend API",
    version: "0.1.0",
    description:
      "The Khove Express backend. Two transports:\n\n" +
      "- **REST** (`/api/*`, `/healthz`) — documented below.\n" +
      "- **tRPC** (`/trpc/<procedure>`) — queries are GET with a superjson `input` " +
      "query param; mutations are POST with a superjson JSON body. Workspace-scoped " +
      "procedures require the `x-workspace-id` header.\n\n" +
      "**Auth:** every non-public endpoint needs `Authorization: Bearer <Clerk session token>` " +
      "(the frontend forwards it; `workspace.me` is the current-user/session endpoint). " +
      "Webhooks authenticate by signature (HMAC/Svix), Inngest by signing key. The realtime " +
      "**socket.io** gateway (Clerk-handshake auth) is not HTTP-documented here.",
  },
  servers: [{ url: env.BACKEND_URL }],
  tags: [
    { name: "Health", description: "Liveness + this document" },
    { name: "Auth & Session", description: "Current user / session (Clerk token → Prisma user)" },
    { name: "Workspaces", description: "Workspace CRUD + membership resolution" },
    { name: "Members", description: "Workspace member management (admin)" },
    { name: "Tasks", description: "Tasks + workflow statuses (tRPC + REST mutations)" },
    { name: "Conversations & Chat", description: "AI chat + conversation history" },
    { name: "Integrations", description: "GitHub / Google Calendar OAuth + status" },
    { name: "Calendar", description: "External calendar entries (planner)" },
    { name: "Onboarding", description: "First-run personal workspace setup" },
    { name: "Webhooks", description: "Inbound provider webhooks (signature-authed)" },
    { name: "Inngest", description: "Background-job serve endpoint (signing-key-authed)" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT",
        description: "Clerk session token (forwarded by the frontend)" },
    },
    parameters: {
      WorkspaceIdHeader: {
        name: "x-workspace-id", in: "header", required: true,
        description: "Active workspace id (required by workspace-scoped tRPC procedures)",
        schema: { type: "string" },
      },
    },
    requestBodies: {
      WorkspaceIdBody: {
        required: true,
        content: { "application/json": { schema: {
          type: "object", required: ["workspaceId"],
          properties: { workspaceId: { type: "string" } } } } },
      },
    },
  },
  // Global default: bearer auth. Public endpoints override with `security: []`.
  security: [{ bearerAuth: [] as string[] }],
  paths: { ...restPaths, ...trpcPaths },
};
