// Every extension Dither ships. Adding one is adding a folder and a line here.

import type { Extension } from "./api";
import airQuality from "./air-quality";
import aircraft from "./aircraft";
import iss from "./iss";
import clock from "./clock";
import countdown from "./countdown";
import crypto from "./crypto";
import date from "./date";
import gallery from "./gallery";
import googleCalendar from "./google-calendar";
import messages from "./messages";
import picture from "./picture";
import status from "./status";
import stripe from "./stripe";
import text from "./text";
import trenord from "./trenord";
import weather from "./weather";
import webPage from "./web-page";
import webValue from "./web-value";

export const EXTENSIONS: readonly Extension[] = [
  clock, date, weather, airQuality, googleCalendar, trenord, aircraft, iss, text, messages, countdown, picture, gallery, stripe, crypto, webValue, webPage, status,
] as unknown as Extension[];
