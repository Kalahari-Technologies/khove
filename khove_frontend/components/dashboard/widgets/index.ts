/**
 * Barrel of all dashboard widget body components. Each renders ONLY its inner
 * content — the outer card frame, title, and toolbar come from the widget shell.
 * Imported by the widget registry.
 */
export { KpiSingleWidget } from "./kpi-single";
export { GithubPrPipelineWidget } from "./github-pr-pipeline";
export { GithubThroughputWidget } from "./github-throughput";
export { GithubCycleTimeWidget } from "./github-cycle-time";
export { GithubReviewLoadWidget } from "./github-review-load";
export { GithubMilestonesWidget } from "./github-milestones";
export { GithubReposWidget } from "./github-repos";
export { JiraSprintBurndownWidget } from "./jira-sprint-burndown";
export { JiraVelocityWidget } from "./jira-velocity";
export { JiraEpicsWidget } from "./jira-epics";
export { JiraStatusDistributionWidget } from "./jira-status-distribution";
export { CrossActivityWidget } from "./cross-activity";
export { CrossGapsWidget } from "./cross-gaps";
export { CrossThreadsWidget } from "./cross-threads";
export { CalendarAgendaWidget } from "./calendar-agenda";
export { CalendarTodayWidget } from "./calendar-today";
export { CalendarInsightsWidget } from "./calendar-insights";
export { PlannerDeadlinesWidget } from "./planner-deadlines";
export { PlannerOverdueWidget } from "./planner-overdue";
export { AgentProposalsWidget } from "./agent-proposals";
export { AiWeeklyReportWidget } from "./ai-weekly-report";
