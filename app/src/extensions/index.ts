// Every extension Dither ships. Adding one is adding a folder and a line here.

import type { Extension } from "./api";
import clock from "./clock";
import countdown from "./countdown";
import crypto from "./crypto";
import date from "./date";
import googleCalendar from "./google-calendar";
import messages from "./messages";
import picture from "./picture";
import status from "./status";
import stripe from "./stripe";
import text from "./text";
import trenord from "./trenord";
import weather from "./weather";
import webValue from "./web-value";

export const EXTENSIONS: readonly Extension[] = [
  clock, date, weather, googleCalendar, trenord, text, messages, countdown, picture, stripe, crypto, webValue, status,
] as unknown as Extension[];
