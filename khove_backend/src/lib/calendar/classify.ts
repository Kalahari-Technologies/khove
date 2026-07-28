import type { calendar_v3 } from "googleapis";

/**
 * Two-stage Google Calendar event classification (per the research note in
 * product_docs / attachments). Stage 1 detects a conferencing layer + provider;
 * Stage 2 classifies the event's *intent*. The product rule:
 *
 *   Only genuine MEETINGS become Khove Tasks (a conference link OR real
 *   attendees). Everything else — birthdays, appointments, travel, focus blocks,
 *   personal/all-day events — stays calendar-only (a CalendarEntry).
 *
 * This keeps the Tasks list and the intelligence layer clean: a "Prayer Fasting"
 * all-day event is no longer a task and no longer counted as a meeting.
 */

export type MeetingProvider =
  | "google_meet"
  | "zoom"
  | "microsoft_teams"
  | "webex"
  | "other"
  | "unknown";

export type CalendarEventType =
  | "meeting"
  | "task"
  | "focus_block"
  | "appointment"
  | "travel"
  | "personal"
  | "other";

// Maintain a provider registry rather than hard-coding domain checks everywhere.
const CONFERENCE_PROVIDERS: Record<
  Exclude<MeetingProvider, "other" | "unknown">,
  string[]
> = {
  google_meet: ["meet.google.com"],
  zoom: ["zoom.us"],
  microsoft_teams: ["teams.microsoft.com", "teams.live.com"],
  webex: ["webex.com"],
};

export function detectProviderFromUrl(url?: string | null): MeetingProvider {
  if (!url) return "unknown";
  const value = url.toLowerCase();
  for (const [provider, domains] of Object.entries(CONFERENCE_PROVIDERS)) {
    if (domains.some((d) => value.includes(d))) return provider as MeetingProvider;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Stage 1 — conferencing detection
// ---------------------------------------------------------------------------

export interface MeetingDetection {
  hasConference: boolean;
  provider: MeetingProvider;
  joinUrl?: string;
  confidence: number;
}

export function detectMeeting(event: calendar_v3.Schema$Event): MeetingDetection {
  const confType = event.conferenceData?.conferenceSolution?.key?.type;
  const confUrl = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  )?.uri;

  if (confType === "hangoutsMeet") {
    return { hasConference: true, provider: "google_meet", joinUrl: confUrl ?? undefined, confidence: 1 };
  }
  const confProvider = detectProviderFromUrl(confUrl);
  if (confProvider !== "unknown") {
    return { hasConference: true, provider: confProvider, joinUrl: confUrl ?? undefined, confidence: 1 };
  }
  if (event.hangoutLink) {
    return { hasConference: true, provider: "google_meet", joinUrl: event.hangoutLink, confidence: 1 };
  }
  const locProvider = detectProviderFromUrl(event.location);
  if (locProvider !== "unknown") {
    return { hasConference: true, provider: locProvider, joinUrl: event.location ?? undefined, confidence: 0.95 };
  }
  const urls = (event.description ?? "").match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  for (const u of urls) {
    const p = detectProviderFromUrl(u);
    if (p !== "unknown") return { hasConference: true, provider: p, joinUrl: u, confidence: 0.9 };
  }
  if (event.conferenceData) {
    return { hasConference: true, provider: "other", joinUrl: confUrl ?? undefined, confidence: 0.8 };
  }
  return { hasConference: false, provider: "unknown", confidence: 0 };
}

// ---------------------------------------------------------------------------
// Stage 2 — intent classification
// ---------------------------------------------------------------------------

const TRAVEL_KEYWORDS = ["flight", "airport", "train", "bus", "hotel", "travel", "trip", "layover", "boarding", "→"];
const APPOINTMENT_KEYWORDS = ["dentist", "doctor", "appointment", "clinic", "hospital", "haircut", "salon", "checkup", "check-up", "therapy"];
const FOCUS_KEYWORDS = ["focus", "deep work", "deep-work", "heads down", "heads-down", "work block", "writing time", "coding time", "deep dive"];
const PERSONAL_KEYWORDS = ["birthday", "anniversary", "lunch", "dinner", "gym", "workout", "prayer", "fasting", "church", "mass", "vacation", "holiday", "day off", "leave", "personal", "break"];

function titleHasAny(title: string, words: string[]): boolean {
  const t = title.toLowerCase();
  return words.some((w) => t.includes(w));
}

export interface EventClassification {
  type: CalendarEventType;
  /** Task-worthy: a real meeting (conference link OR ≥1 non-self attendee). */
  isMeeting: boolean;
  provider: MeetingProvider;
  joinUrl?: string;
  attendeeCount: number;
  isRecurring: boolean;
  isAllDay: boolean;
  confidence: number;
}

export function classifyEvent(event: calendar_v3.Schema$Event): EventClassification {
  const detection = detectMeeting(event);
  const attendees = event.attendees ?? [];
  const nonSelfAttendees = attendees.filter((a) => !a.self && !a.resource);
  const attendeeCount = attendees.length;
  const hasRealAttendees = nonSelfAttendees.length >= 1;
  const isRecurring = !!(event.recurringEventId || event.recurrence);
  const isAllDay = !event.start?.dateTime;
  const title = event.summary ?? "";
  const eventType = event.eventType ?? "default";

  const base = {
    provider: detection.provider,
    joinUrl: detection.joinUrl,
    attendeeCount,
    isRecurring,
    isAllDay,
  };

  // Google-native special event types are never meetings.
  if (eventType === "birthday") return { ...base, type: "personal", isMeeting: false, confidence: 1 };
  if (eventType === "focusTime") return { ...base, type: "focus_block", isMeeting: false, confidence: 1 };
  if (eventType === "outOfOffice") return { ...base, type: "personal", isMeeting: false, confidence: 1 };
  if (eventType === "workingLocation") return { ...base, type: "other", isMeeting: false, confidence: 1 };

  // A real meeting: has a conferencing layer OR real (non-self) attendees.
  const isMeeting = detection.hasConference || hasRealAttendees;
  if (isMeeting) {
    return { ...base, type: "meeting", isMeeting: true, confidence: detection.hasConference ? 0.95 : 0.8 };
  }

  // Calendar-only intents (never tasks).
  let type: CalendarEventType;
  if (titleHasAny(title, TRAVEL_KEYWORDS)) type = "travel";
  else if (titleHasAny(title, APPOINTMENT_KEYWORDS)) type = "appointment";
  else if (titleHasAny(title, FOCUS_KEYWORDS)) type = "focus_block";
  else if (titleHasAny(title, PERSONAL_KEYWORDS)) type = "personal";
  else if (isAllDay) type = "personal";
  else type = "personal";

  return { ...base, type, isMeeting: false, confidence: 0.6 };
}

/** The product rule: only genuine meetings become Tasks. */
export function shouldBecomeTask(c: EventClassification): boolean {
  return c.isMeeting;
}
