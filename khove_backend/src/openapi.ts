import { env } from "@backend/env";

/**
 * OpenAPI 3.0 spec for the Khove backend (served at /docs, raw at /openapi.json).
 *
 * Two transports, grouped by tag:
 *   - REST routes (Express): chat, tasks, onboarding, integrations, webhooks, health.
 *     Success/error bodies are plain JSON. Errors are always `{ "error": "<message>" }`.
 *   - tRPC procedures (`/trpc/<procedure>`): auth/session, workspaces, members, tasks,
 *     integrations, conversations, calendar. Queries are GET with a superjson `input`
 *     query param; mutations are POST with a superjson body. The response is the tRPC
 *     **batch envelope** — an array of `{ result: { data: { json } } }` (success) or
 *     `{ error: { json } }` (failure). Workspace-scoped procedures require `x-workspace-id`.
 *     The tRPC response examples below are illustrative of that envelope shape.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

// ─────────────────────────────────────────────────────────────
// Reusable example entities (illustrative — not exhaustive field lists)
// ─────────────────────────────────────────────────────────────
const EX = {
  user: { id: "usr_2aB", clerkId: "user_2ab", email: "ada@example.com", name: "Ada Lovelace", planTier: "FREE" },
  workspace: { id: "clw0k2x9a0001", name: "My Space", slug: "ada", gradient: "aurora", role: "OWNER" },
  member: { userId: "usr_2aB", role: "ADMIN", user: { id: "usr_2aB", name: "Ada Lovelace", email: "ada@example.com" } },
  status: { id: "st_inprog", name: "In Progress", category: "IN_PROGRESS", color: "#3b82f6", position: 1, workspaceId: null },
  task: {
    id: "clw0task001", title: "Ship PR Shepherd", description: null, priority: "HIGH",
    statusId: "st_inprog", dueDate: "2026-08-01T09:00:00.000Z", source: ["KHOVE"],
    externalId: null, externalUrl: null, workspaceId: "clw0k2x9a0001",
    createdAt: "2026-07-28T10:00:00.000Z", updatedAt: "2026-07-28T10:00:00.000Z",
    status: { id: "st_inprog", name: "In Progress", category: "IN_PROGRESS", color: "#3b82f6" },
    assignees: [],
  },
  integration: { id: "int_gh01", provider: "GITHUB", workspaceId: "clw0k2x9a0001", userId: "usr_2aB", createdAt: "2026-07-20T12:00:00.000Z" },
  conversation: { id: "conv_01", title: "Weekly planning", createdAt: "2026-07-27T08:00:00.000Z", updatedAt: "2026-07-27T08:12:00.000Z" },
  calendarEntry: { id: "cal_01", title: "Standup", startDate: "2026-07-29T09:00:00.000Z", endDate: "2026-07-29T09:15:00.000Z", workspaceId: "clw0k2x9a0001" },
};

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────
const jsonBody = (schema: Obj, example?: unknown): Obj => ({
  "application/json": { schema, ...(example !== undefined ? { example } : {}) },
});

// REST success response with an explicit schema + example.
const ok = (description: string, schema: Obj, example?: unknown): Obj => ({
  description,
  content: jsonBody(schema, example),
});

// tRPC batch envelopes.
const trpcOkEnvelope = (data: unknown) => [{ result: { data: { json: data } } }];
const TRPC_CODES: Record<string, number> = {
  BAD_REQUEST: -32600, UNAUTHORIZED: -32001, FORBIDDEN: -32003,
  NOT_FOUND: -32004, INTERNAL_SERVER_ERROR: -32603,
};
const trpcErrEnvelope = (code: string, httpStatus: number, path: string, message: string) => [
  { error: { json: { message, code: TRPC_CODES[code] ?? -32603, data: { code, httpStatus, path } } } },
];

const REST_ERROR_REFS = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
  "500": { $ref: "#/components/responses/ServerError" },
};
const restErrors = (...codes: (keyof typeof REST_ERROR_REFS)[]): Obj =>
  Object.fromEntries(codes.map((c) => [c, REST_ERROR_REFS[c]]));

const wsHeader = { $ref: "#/components/parameters/WorkspaceIdHeader" };
const trpcInputQuery = {
  name: "input", in: "query", required: false,
  description: "superjson-encoded procedure input (tRPC-over-HTTP), e.g. `{\"json\":{\"limit\":50}}`",
  schema: { type: "string" },
};
const trpcBody = {
  required: false,
  description: "superjson-wrapped input, e.g. `{ \"json\": { ... } }`",
  content: jsonBody({ type: "object" }, { json: {} }),
};

// ─────────────────────────────────────────────────────────────
// tRPC procedure catalogue
// ─────────────────────────────────────────────────────────────
type Proc = {
  proc: string; method: "get" | "post"; tag: string; summary: string;
  ws: boolean; example: unknown; notFound?: boolean;
};

const trpcProcs: Proc[] = [
  { proc: "workspace.me", method: "get", tag: "Auth & Session", ws: false,
    summary: "Current user + personal workspace slug",
    example: { user: EX.user, personalWorkspaceSlug: "ada" } },
  { proc: "workspace.list", method: "get", tag: "Workspaces", ws: false,
    summary: "List the workspaces the user belongs to", example: [EX.workspace] },
  { proc: "workspace.getBySlug", method: "get", tag: "Workspaces", ws: false,
    summary: "Get a workspace by slug (+ current role)", example: EX.workspace, notFound: true },
  { proc: "workspace.create", method: "post", tag: "Workspaces", ws: false,
    summary: "Create a workspace (seeds default statuses)", example: EX.workspace },
  { proc: "workspace.update", method: "post", tag: "Workspaces", ws: true,
    summary: "Update workspace name/settings (admin)", example: EX.workspace },
  { proc: "workspace.delete", method: "post", tag: "Workspaces", ws: true,
    summary: "Delete workspace (owner; not personal)", example: { success: true } },
  { proc: "workspace.leave", method: "post", tag: "Workspaces", ws: true,
    summary: "Leave a workspace (non-owner)", example: { success: true } },
  { proc: "workspace.listMembers", method: "get", tag: "Members", ws: true,
    summary: "List workspace members", example: [EX.member] },
  { proc: "workspace.inviteMember", method: "post", tag: "Members", ws: true,
    summary: "Invite a member by email (admin)", example: EX.member },
  { proc: "workspace.removeMember", method: "post", tag: "Members", ws: true,
    summary: "Remove a member (admin; not owner)", example: { success: true } },
  { proc: "workspace.updateMemberRole", method: "post", tag: "Members", ws: true,
    summary: "Update a member's role (admin)", example: EX.member },
  { proc: "task.list", method: "get", tag: "Tasks", ws: true,
    summary: "List tasks (filter by status/source/hasDueDate)",
    example: { items: [EX.task], nextCursor: null } },
  { proc: "task.get", method: "get", tag: "Tasks", ws: true,
    summary: "Get a task by id (with status + assignees)", example: EX.task, notFound: true },
  { proc: "task.create", method: "post", tag: "Tasks", ws: true,
    summary: "Create a task (dedupes by externalId)", example: EX.task },
  { proc: "task.update", method: "post", tag: "Tasks", ws: true,
    summary: "Update a task's mutable fields", example: EX.task },
  { proc: "task.assign", method: "post", tag: "Tasks", ws: true,
    summary: "Assign users to a task",
    example: { ...EX.task, assignees: [{ role: "ASSIGNEE", user: EX.member.user }] } },
  { proc: "task.delete", method: "post", tag: "Tasks", ws: true,
    summary: "Soft-delete a task (status → CANCELLED)", example: { ...EX.task, statusId: "st_cancelled" } },
  { proc: "workflowStatus.list", method: "get", tag: "Tasks", ws: true,
    summary: "List workflow statuses (own or system defaults)", example: [EX.status] },
  { proc: "integration.list", method: "get", tag: "Integrations", ws: true,
    summary: "List active integrations (safe fields, no tokens)", example: [EX.integration] },
  { proc: "integration.get", method: "get", tag: "Integrations", ws: true,
    summary: "Get one integration by provider (no tokens)", example: EX.integration },
  { proc: "integration.syncStatus", method: "get", tag: "Integrations", ws: true,
    summary: "Google Calendar sync status",
    example: { status: "idle", lastSyncedAt: "2026-07-28T09:30:00.000Z" } },
  { proc: "conversation.list", method: "get", tag: "Conversations & Chat", ws: true,
    summary: "Recent conversations (sidebar)", example: [EX.conversation] },
  { proc: "conversation.get", method: "get", tag: "Conversations & Chat", ws: true,
    summary: "Get a conversation (with messages)",
    example: { ...EX.conversation, messages: [{ id: "msg_1", role: "user", content: "Plan my week" }] },
    notFound: true },
  { proc: "calendarEntry.list", method: "get", tag: "Calendar", ws: true,
    summary: "List external calendar entries (planner)", example: [EX.calendarEntry] },
];

function trpcOperation(p: Proc): Obj {
  const parameters = [
    ...(p.ws ? [wsHeader] : []),
    ...(p.method === "get" ? [trpcInputQuery] : []),
  ];
  const responses: Obj = {
    "200": ok(
      "Success — tRPC batch envelope",
      { $ref: "#/components/schemas/TrpcResponse" },
      trpcOkEnvelope(p.example)
    ),
    "401": { $ref: "#/components/responses/TrpcUnauthorized" },
  };
  if (p.ws) responses["403"] = { $ref: "#/components/responses/TrpcForbidden" };
  if (p.notFound)
    responses["404"] = ok(
      "Not found — tRPC error envelope",
      { $ref: "#/components/schemas/TrpcError" },
      trpcErrEnvelope("NOT_FOUND", 404, p.proc, "Not found")
    );

  const op: Obj = { tags: [p.tag], summary: p.summary, responses };
  if (parameters.length) op.parameters = parameters;
  if (p.method === "post") op.requestBody = trpcBody;
  return { [p.method]: op };
}

const trpcPaths: Obj = {};
for (const p of trpcProcs) trpcPaths[`/trpc/${p.proc}`] = trpcOperation(p);

// ─────────────────────────────────────────────────────────────
// REST paths
// ─────────────────────────────────────────────────────────────
const restPaths: Obj = {
  "/healthz": {
    get: { tags: ["Health"], summary: "Health check", security: [],
      responses: { "200": ok("Service is up",
        { type: "object", properties: { ok: { type: "boolean" } } }, { ok: true }) } },
  },
  "/openapi.json": {
    get: { tags: ["Health"], summary: "This OpenAPI document", security: [],
      responses: { "200": ok("OpenAPI 3.0 spec", { type: "object" }) } },
  },
  "/api/inngest": {
    post: { tags: ["Inngest"], summary: "Inngest serve handler (also GET/PUT)", security: [],
      description: "Inngest introspection (GET), event/step invocation (POST), and function registration (PUT). Authenticated by the Inngest signing key, not Clerk.",
      responses: { "200": ok("Inngest response", { type: "object" }) } },
  },
  "/api/chat": {
    post: {
      tags: ["Conversations & Chat"], summary: "AI conversation turn",
      requestBody: { required: true, content: jsonBody({
        type: "object", required: ["message", "workspaceId"],
        properties: {
          message: { type: "string", maxLength: 4000, example: "What PRs need my review?" },
          conversationId: { type: "string", nullable: true },
          workspaceId: { type: "string" },
        } }) },
      responses: {
        "200": ok("AI turn (or `blocked:true` on usage limit — never a 4xx)",
          { $ref: "#/components/schemas/ChatResponse" },
          { blocked: false, response: "You have 2 PRs awaiting review…", conversationId: "conv_01", model: "haiku" }),
        ...restErrors("400", "401", "403", "500"),
      },
    },
  },
  "/api/tasks": {
    post: {
      tags: ["Tasks"], summary: "Create a task (REST — used by the new-task form)",
      requestBody: { required: true, content: jsonBody({
        type: "object", required: ["title", "workspaceId"],
        properties: {
          title: { type: "string", example: "Ship PR Shepherd" }, workspaceId: { type: "string" },
          statusId: { type: "string", nullable: true },
          priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"], default: "MEDIUM" },
          dueDate: { type: "string", format: "date-time", nullable: true },
          description: { type: "string", nullable: true }, syncToGoogle: { type: "boolean" },
        } }) },
      responses: {
        "201": ok("Created", { type: "object", properties: { id: { type: "string" } } }, { id: "clw0task001" }),
        ...restErrors("400", "401", "403", "500"),
      },
    },
  },
  "/api/tasks/{id}/status": {
    patch: {
      tags: ["Tasks"], summary: "Update task status (REST)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: jsonBody({
        type: "object", required: ["statusId"], properties: { statusId: { type: "string" } } }) },
      responses: { "200": { $ref: "#/components/responses/OkTrue" }, ...restErrors("400", "401", "404", "500") },
    },
  },
  "/api/tasks/{id}/priority": {
    patch: {
      tags: ["Tasks"], summary: "Update task priority (REST)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: jsonBody({
        type: "object", required: ["priority"],
        properties: { priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"] } } }) },
      responses: { "200": { $ref: "#/components/responses/OkTrue" }, ...restErrors("400", "401", "404", "500") },
    },
  },
  "/api/tasks/{id}/due-date": {
    patch: {
      tags: ["Tasks"], summary: "Update task due date (adjusts linked GCal meeting)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: jsonBody({
        type: "object", required: ["dueDate"],
        properties: { dueDate: { type: "string", format: "date-time" } } }) },
      responses: { "200": { $ref: "#/components/responses/OkTrue" }, ...restErrors("400", "401", "404", "500") },
    },
  },
  "/api/onboarding": {
    post: {
      tags: ["Onboarding"], summary: "Set personal-workspace slug + gradient",
      requestBody: { required: true, content: jsonBody({
        type: "object", required: ["username"],
        properties: { username: { type: "string", example: "ada" }, gradient: { type: "string", example: "aurora" } } }) },
      responses: {
        "200": ok("Slug set", { type: "object",
          properties: { success: { type: "boolean" }, slug: { type: "string" } } }, { success: true, slug: "ada" }),
        "401": { $ref: "#/components/responses/Unauthorized" },
        "409": ok("Username already taken", { $ref: "#/components/schemas/Error" }, { error: "Username taken" }),
      },
    },
  },
  "/api/integrations/github/connect": {
    get: {
      tags: ["Integrations"], summary: "Start GitHub OAuth (returns the URL to redirect to)",
      parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        "200": ok("Redirect URL — the client sends the browser here",
          { $ref: "#/components/schemas/ConnectUrl" }, { url: "https://github.com/login/oauth/authorize?..." }),
        ...restErrors("401", "403"),
      },
    },
  },
  "/api/integrations/github/callback": {
    get: {
      tags: ["Integrations"], summary: "GitHub OAuth callback (browser redirect target)", security: [],
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
      responses: { "200": { $ref: "#/components/responses/Success" }, ...restErrors("403", "404") },
    },
  },
  "/api/integrations/google/connect": {
    get: {
      tags: ["Integrations"], summary: "Start Google Calendar OAuth (returns the URL)",
      parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        "200": ok("Redirect URL", { $ref: "#/components/schemas/ConnectUrl" },
          { url: "https://accounts.google.com/o/oauth2/v2/auth?..." }),
        ...restErrors("401", "403"),
      },
    },
  },
  "/api/integrations/google/callback": {
    get: {
      tags: ["Integrations"], summary: "Google OAuth callback (browser redirect target)", security: [],
      responses: { "302": { description: "Redirects to the frontend planner" } },
    },
  },
  "/api/integrations/google/disconnect": {
    post: {
      tags: ["Integrations"], summary: "Disconnect Google Calendar (admin)",
      requestBody: { $ref: "#/components/requestBodies/WorkspaceIdBody" },
      responses: { "200": { $ref: "#/components/responses/Success" }, ...restErrors("403", "404") },
    },
  },
  "/api/integrations/google/sync-status": {
    get: {
      tags: ["Integrations"], summary: "Google Calendar sync status (REST)",
      parameters: [{ name: "workspaceId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        "200": ok("Sync status", { type: "object",
          properties: { status: { type: "string", enum: ["idle", "syncing", "error", "disconnected"] },
            lastSyncedAt: { type: "string", format: "date-time", nullable: true } } },
          { status: "idle", lastSyncedAt: "2026-07-28T09:30:00.000Z" }),
        ...restErrors("401", "403"),
      },
    },
  },
  "/api/webhooks/github": {
    post: {
      tags: ["Webhooks"], summary: "GitHub App webhook (HMAC-signed)", security: [],
      parameters: [{ name: "x-hub-signature-256", in: "header", schema: { type: "string" } }],
      responses: {
        "200": ok("Accepted", { $ref: "#/components/schemas/Received" }, { received: true }),
        "401": ok("Invalid signature", { $ref: "#/components/schemas/Error" }, { error: "Invalid signature" }),
      },
    },
  },
  "/api/webhooks/google-calendar": {
    post: {
      tags: ["Webhooks"], summary: "Google Calendar push notification", security: [],
      parameters: [
        { name: "x-goog-channel-id", in: "header", schema: { type: "string" } },
        { name: "x-goog-resource-id", in: "header", schema: { type: "string" } },
      ],
      responses: { "200": { $ref: "#/components/responses/OkTrue" } },
    },
  },
  "/api/webhooks/clerk": {
    post: {
      tags: ["Webhooks"], summary: "Clerk user/session webhook (Svix-signed)", security: [],
      description: "Syncs Clerk users → DB, seeds the personal workspace, and dispatches welcome/OTP/new-device emails.",
      responses: {
        "200": ok("Accepted", { $ref: "#/components/schemas/Received" }, { received: true }),
        "400": ok("Invalid signature", { $ref: "#/components/schemas/Error" }, { error: "Invalid signature" }),
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────
// Spec
// ─────────────────────────────────────────────────────────────
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Khove Backend API",
    version: "0.1.0",
    description:
      "The Khove Express backend. Two transports:\n\n" +
      "- **REST** (`/api/*`, `/healthz`) — plain JSON. Errors are `{ \"error\": \"<message>\" }`.\n" +
      "- **tRPC** (`/trpc/<procedure>`) — queries GET (superjson `input` query param), mutations " +
      "POST (superjson body). Responses use the tRPC **batch envelope**: an array of " +
      "`[{ result: { data: { json } } }]` on success, `[{ error: { json } }]` on failure. " +
      "Workspace-scoped procedures require the `x-workspace-id` header. tRPC examples below " +
      "illustrate this envelope.\n\n" +
      "**Auth:** every non-public endpoint needs `Authorization: Bearer <Clerk session token>` " +
      "(the frontend forwards it; `workspace.me` is the current-user/session endpoint). Clerk " +
      "hosts sign-in/up — there are **no login endpoints on the backend**. Webhooks authenticate " +
      "by signature (HMAC/Svix), Inngest by signing key. The realtime **socket.io** gateway " +
      "(Clerk-handshake auth) is not HTTP-documented here.",
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
        content: jsonBody({ type: "object", required: ["workspaceId"],
          properties: { workspaceId: { type: "string" } } }, { workspaceId: "clw0k2x9a0001" }),
      },
    },
    schemas: {
      Error: {
        type: "object", properties: { error: { type: "string" } },
        required: ["error"], example: { error: "Unauthorized" },
      },
      OkTrue: { type: "object", properties: { ok: { type: "boolean" } }, example: { ok: true } },
      Success: { type: "object", properties: { success: { type: "boolean" } }, example: { success: true } },
      Received: { type: "object", properties: { received: { type: "boolean" } }, example: { received: true } },
      ConnectUrl: { type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] },
      ChatResponse: {
        type: "object",
        properties: {
          blocked: { type: "boolean" },
          response: { type: "string" },
          conversationId: { type: "string", nullable: true },
          model: { type: "string", nullable: true, enum: ["flash", "haiku", "sonnet"] },
        },
      },
      TrpcResponse: {
        type: "array",
        description: "tRPC batch success envelope. `result.data.json` holds the procedure's return value (superjson).",
        items: { type: "object", properties: {
          result: { type: "object", properties: { data: { type: "object",
            properties: { json: {}, meta: { type: "object" } } } } } } },
        example: trpcOkEnvelope(EX.task),
      },
      TrpcError: {
        type: "array",
        description: "tRPC batch error envelope. tRPC maps the error `code` to the HTTP status (UNAUTHORIZED→401, FORBIDDEN→403, NOT_FOUND→404, BAD_REQUEST→400).",
        items: { type: "object", properties: {
          error: { type: "object", properties: { json: { type: "object", properties: {
            message: { type: "string" }, code: { type: "integer" },
            data: { type: "object", properties: {
              code: { type: "string" }, httpStatus: { type: "integer" }, path: { type: "string" } } } } } } } } },
        example: trpcErrEnvelope("FORBIDDEN", 403, "task.list", "No workspace context"),
      },
      // Entity shapes (illustrative; workspace-scoped rows carry additional fields).
      Task: { type: "object", additionalProperties: true, example: EX.task },
      WorkflowStatus: { type: "object", additionalProperties: true, example: EX.status },
      Workspace: { type: "object", additionalProperties: true, example: EX.workspace },
      Member: { type: "object", additionalProperties: true, example: EX.member },
      Integration: { type: "object", additionalProperties: true, example: EX.integration },
      Conversation: { type: "object", additionalProperties: true, example: EX.conversation },
      CalendarEntry: { type: "object", additionalProperties: true, example: EX.calendarEntry },
    },
    responses: {
      // Reusable REST responses (with schema + example).
      OkTrue: ok("Success", { $ref: "#/components/schemas/OkTrue" }, { ok: true }),
      Success: ok("Success", { $ref: "#/components/schemas/Success" }, { success: true }),
      BadRequest: ok("Bad request — validation failed", { $ref: "#/components/schemas/Error" }, { error: "Message is required" }),
      Unauthorized: ok("Missing or invalid Clerk token", { $ref: "#/components/schemas/Error" }, { error: "Unauthorized" }),
      Forbidden: ok("Not a workspace member / insufficient role", { $ref: "#/components/schemas/Error" }, { error: "Forbidden" }),
      NotFound: ok("Resource not found (or not owned)", { $ref: "#/components/schemas/Error" }, { error: "Not found" }),
      ServerError: ok("Unexpected server error", { $ref: "#/components/schemas/Error" }, { error: "Internal server error" }),
      // Reusable tRPC error responses.
      TrpcUnauthorized: ok("Unauthorized — tRPC error envelope", { $ref: "#/components/schemas/TrpcError" },
        trpcErrEnvelope("UNAUTHORIZED", 401, "workspace.me", "UNAUTHORIZED")),
      TrpcForbidden: ok("Forbidden — no workspace context or insufficient role", { $ref: "#/components/schemas/TrpcError" },
        trpcErrEnvelope("FORBIDDEN", 403, "task.list", "No workspace context")),
    },
  },
  // Global default: bearer auth. Public endpoints override with `security: []`.
  security: [{ bearerAuth: [] as string[] }],
  paths: { ...restPaths, ...trpcPaths },
};
