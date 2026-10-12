// Calendar adapter contract (stage 3). Until Google Calendar OAuth is set up,
// every call fails loudly so nothing pretends a meeting was booked.

import { NotConnectedError } from "./not-connected.ts";

export interface CalendarEvent {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  timezone: string;
  attendees?: string[];
  location?: string;
  description?: string;
}

export interface CalendarAdapter {
  readonly name: string;
  listEvents(range: { start: Date; end: Date }): Promise<CalendarEvent[]>;
  /** Only the owner's own blocks; inviting others goes through approval_request. */
  createPersonalBlock(event: CalendarEvent): Promise<{ id: string }>;
}

export const calendar: CalendarAdapter = {
  name: "google-calendar",
  async listEvents() {
    throw new NotConnectedError("Google Calendar", "3-bosqichda OAuth adapteri qo‘shiladi (INTEGRATIONS.md).");
  },
  async createPersonalBlock() {
    throw new NotConnectedError("Google Calendar", "Uchrashuv vazifa sifatida saqlandi, kalendarga yozilmadi.");
  },
};
