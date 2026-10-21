// Every extension Dither ships. Adding one is adding a folder and a line here.

import type { Extension } from "./api";
import airQuality from "./air-quality";
import aircraft from "./aircraft";
import iss from "./iss";
import ships from "./ships";
import claudeCode from "./claude-code";
import clock from "./clock";
import countdown from "./countdown";
import crypto from "./crypto";
import date from "./date";
import gallery from "./gallery";
import googleCalendar from "./google-calendar";
import messages from "./messages";
import moon from "./moon";
import picture from "./picture";
import quote from "./quote";
import status from "./status";
import stocks from "./stocks";
import stripe from "./stripe";
import text from "./text";
import trenord from "./trenord";
import weather from "./weather";
import webPage from "./web-page";
import webValue from "./web-value";

export const EXTENSIONS: readonly Extension[] = [
  clock, date, weather, airQuality, googleCalendar, trenord, aircraft, iss, ships, moon, text, messages, quote, countdown, picture, gallery, stripe, stocks, claudeCode, crypto, webValue, webPage, status,
] as unknown as Extension[];
