import { type JSX } from "react";

export type EventData = {
  id: string;
  title: string;
  isActive?: boolean;
  startDate?: string;
  endDate: string;
  bodyText: string | string[] | JSX.Element;
  chains?: number[];
  link?: {
    text: string;
    href: string;
    /**
     * @default false
     */
    newTab?: boolean;
  };
};

export const homeEventsData: EventData[] = [];

export const AL16Z_DELISTING_EVENT_ID = "al16z-delisting";

export const appEventsData: EventData[] = [];
