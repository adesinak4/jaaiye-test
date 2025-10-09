# Calendar System

## Overview

This document explains how Jaaiye calendars interact with Google Calendars and how events are created, read, and synchronized.

## Data Model (Jaaiye)

- Calendar
  - owner: UserId (unique) — one Jaaiye calendar per user
  - name, color, isDefault
  - google: { linkedIds: string[], primaryId?: string }
- Event
  - calendar: CalendarId
  - external.google: { calendarId, eventId, etag }

## Google Integration

- Users can link their Google account (tokens stored on User.googleCalendar)
- Calendar-level mapping
  - linkedIds: multiple Google calendar IDs read for aggregation
  - primaryId: the Google calendar ID used for write-through (create/update/delete)

## Creation Flows

### User Registration
1. User registers (or first-time Google sign-in)
2. System auto-creates a default Jaaiye calendar `{ owner: userId, name: 'My Calendar' }`

### Create Event (Jaaiye)
1. Client calls `POST /api/events`
   - If `calendarId` omitted → server uses the user's Jaaiye calendar
   - Optional `googleCalendarId` to override write target
2. Server creates the Jaaiye event
3. If Google is linked:
   - Determine Google target: override `googleCalendarId` → `calendar.google.primaryId` → fallback to user `jaaiyeCalendarId`
   - Write event to Google and store `external.google`

## Reading Flows

### Jaaiye Events for a Calendar
1. Client calls `GET /api/calendars/:calendarId/events`
2. Server returns events from Jaaiye for that calendar

### Unified Google View
1. Client calls Google endpoints (e.g., `/google/unified-calendar`)
2. Server aggregates events from `linkedIds` or user’s selected Google calendars
3. Results are enhanced with calendar metadata

## Mapping Management

- Link Google calendars to Jaaiye calendar
  - `POST /api/calendars/:id/google/link` with `{ linkedIds: string[] }`
- Set primary Google calendar for writes
  - `POST /api/calendars/:id/google/primary` with `{ primaryId: string }` (must be in `linkedIds`)

## Access Control

- One calendar per user; owner-only access for mutations
- Event access validated via calendar ownership

## Edge Cases & Notes

- If Google is not linked, events are created only in Jaaiye
- If `primaryId` is not set and no override provided, write-through falls back to service default (ensuring a Jaaiye Google calendar)
- If `primaryId` not in `linkedIds`, request is rejected

## Scenarios Summary

1) New user (email/password)
   - Auto-create Jaaiye calendar
   - No Google writes until user links account

2) New user (Google sign-in)
   - Auto-create Jaaiye calendar
   - Can immediately write to Google using default target

3) Create event without calendarId
   - Uses the user’s Jaaiye calendar
   - Writes to Google using primary or override

4) Map multiple Google calendars to one Jaaiye calendar
   - Reads aggregate from all `linkedIds`
   - Writes go to `primaryId` unless overridden

5) Change primary
   - Future writes go to the new `primaryId`