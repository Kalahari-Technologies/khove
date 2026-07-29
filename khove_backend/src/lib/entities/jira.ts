import type { EntityInput } from "@backend/lib/entities/record";
import { parseSprintField, type JiraIssue, type JiraFieldMap } from "@backend/lib/integrations/jira";

const JIRA = "JIRA" as const;

/**
 * Derive the container entities (project, sprint, epic, release, component) embedded
 * in a Jira issue. Dedupe across a batch by externalId at the call site.
 */
export function jiraEntitiesFromIssue(issue: JiraIssue, fieldMap: JiraFieldMap, siteUrl: string): EntityInput[] {
  const out: EntityInput[] = [];
  const f = issue.fields;
  const projectKey = f.project?.key;

  if (projectKey) {
    out.push({
      provider: JIRA,
      kind: "PROJECT",
      externalId: `jira-project-${projectKey}`,
      key: projectKey,
      name: f.project?.name ?? projectKey,
      url: siteUrl ? `${siteUrl}/browse/${projectKey}` : null,
    });
  }

  // Sprint (from the resolved custom field).
  const sprint = fieldMap.sprint ? parseSprintField(f[fieldMap.sprint]) : null;
  if (sprint?.name) {
    out.push({
      provider: JIRA,
      kind: "SPRINT",
      externalId: `jira-sprint-${sprint.id ?? sprint.name}`,
      key: sprint.name,
      name: sprint.name,
      status: sprint.state,
      parentExternalId: projectKey ? `jira-project-${projectKey}` : null,
      metadata: { startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal },
    });
  }

  // Epic (team-managed parent that is an epic, or the Epic Link custom field).
  const parent = f.parent;
  const parentIsEpic = (parent?.fields?.issuetype?.name ?? "").toLowerCase() === "epic";
  const epicKey = (fieldMap.epicLink ? (f[fieldMap.epicLink] as string | null) : null) ?? (parentIsEpic ? parent?.key : null);
  if (epicKey) {
    out.push({
      provider: JIRA,
      kind: "EPIC",
      externalId: `jira-epic-${epicKey}`,
      key: epicKey,
      name: parentIsEpic && parent?.fields?.summary ? parent.fields.summary : epicKey,
      url: siteUrl ? `${siteUrl}/browse/${epicKey}` : null,
      parentExternalId: projectKey ? `jira-project-${projectKey}` : null,
    });
  }

  // Releases (fixVersions).
  for (const v of f.fixVersions ?? []) {
    if (!v.name) continue;
    out.push({
      provider: JIRA,
      kind: "RELEASE",
      externalId: `jira-release-${projectKey}-${v.name}`,
      key: v.name,
      name: v.name,
      status: v.released ? "released" : "unreleased",
      parentExternalId: projectKey ? `jira-project-${projectKey}` : null,
    });
  }

  // Components.
  for (const c of f.components ?? []) {
    if (!c.name) continue;
    out.push({
      provider: JIRA,
      kind: "COMPONENT",
      externalId: `jira-component-${projectKey}-${c.name}`,
      key: c.name,
      name: c.name,
      parentExternalId: projectKey ? `jira-project-${projectKey}` : null,
    });
  }

  return out;
}
