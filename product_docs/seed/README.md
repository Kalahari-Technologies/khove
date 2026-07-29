# Troco simulation seed

`troco-simulation.ics` — ~16 simulated meetings (standups, sprint planning, PR
reviews, release cutovers, retros) for a fictional Troco squad, aligned to the
seeded **TROCO** Jira project and the **Troco-Company** GitHub work. Descriptions
reference Jira keys (e.g. `TROCO-16`) and PRs (`PR #133`, `PR #140`) so Khove's
Connectivity Thread auto-linking can tie meetings ↔ tickets ↔ code.

Times are UTC; the source project timezone is `Africa/Kigali` (UTC+2), so a
`07:00Z` planning session reads as 09:00 in Kigali. Two events recur: the weekday
standup and a weekly Monday sync (mid-July → mid-August 2026).

## Import into Google Calendar (so it flows into Khove)

**Do this so it's trivially reversible — import into a dedicated calendar:**

1. Google Calendar → left sidebar → **Other calendars → + → Create new calendar**.
   Name it `Troco Simulation`. Create.
2. **Settings → Import & export → Import**. Choose `troco-simulation.ics`, and for
   **"Add to calendar"** pick **Troco Simulation** (not your primary). Import.
3. In Khove, connect Google Calendar (or re-sync). The meetings appear on the
   Planner (Meetings layer) and as meeting tasks; attendees + Jira/PR refs light up
   the cockpit + threads.

> The only attendee that resolves to a Khove member is you (`tools@softcom.xyz`);
> the teammates are simulated and show as attendees only.

## Unseed

- **Google side (removes every event at once):** delete the **Troco Simulation**
  calendar (Calendar settings → *Remove calendar* → Delete). If you imported into
  your primary instead, every event UID is prefixed `troco-sim-` for manual cleanup.
- **Khove side:** disconnecting Google Calendar purges the synced meeting tasks
  (disconnect cleanup). Or, after deleting the sim calendar, re-sync — Khove
  propagates the deletions.
