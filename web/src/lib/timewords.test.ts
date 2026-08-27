import { describe, expect, it } from "vitest";

import {
  clockWords,
  daysInWords,
  partOfDay,
  spanInWords,
  throughDay,
  timeInWords,
  wrap,
} from "./timewords";

const at = (hours: number, minutes = 0) => hours * 60 + minutes;

describe("clockWords", () => {
  it("names the marks the way they are spoken", () => {
    expect(clockWords(at(10))).toBe("ten o'clock");
    expect(clockWords(at(10, 15))).toBe("quarter past ten");
    expect(clockWords(at(10, 30))).toBe("half past ten");
  });

  it("names the second half of the hour after the hour it is running towards", () => {
    expect(clockWords(at(10, 45))).toBe("quarter to eleven");
    expect(clockWords(at(23, 45))).toBe("quarter to twelve");
  });

  it("has words for the two marks nobody says in numbers", () => {
    expect(clockWords(0)).toBe("midnight");
    expect(clockWords(at(12))).toBe("noon");
  });
});

describe("timeInWords", () => {
  it("never names a mark that has not happened yet", () => {
    // The failure that makes a clock worse than no clock: a panel that goes up
    // at ten o'clock saying quarter past. Every minute of the day is checked,
    // because the one that gets this wrong is always the awkward one.
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const said = timeInWords(minute, 15);
      const passed = Math.floor(minute / 15) * 15;

      expect(said).toContain(clockWords(passed));
      expect(said).not.toContain(clockWords(passed + 15));
    }
  });

  it("drops 'just' once the window outlives it", () => {
    // 10:07 plus fifteen minutes lands at 10:22, past the next mark, so
    // nothing about how recent ten o'clock is will still be true.
    expect(timeInWords(at(10, 7), 15)).toBe("after ten o'clock");
    expect(timeInWords(at(10, 7), 5)).toBe("just gone ten o'clock");
  });

  it("says the mark plainly when it has only just passed", () => {
    expect(timeInWords(at(10, 1), 10)).toBe("ten o'clock");
    expect(timeInWords(at(10, 32), 10)).toBe("half past ten");
    expect(timeInWords(at(10, 36), 5)).toBe("just gone half past ten");
  });

  it("falls back to the part of the day when the window is too wide to say more", () => {
    expect(timeInWords(at(9), 120)).toBe("morning");
  });
});

describe("partOfDay", () => {
  it("uses the words people use, uneven as they are", () => {
    expect(partOfDay(at(2))).toBe("the small hours");
    expect(partOfDay(at(9))).toBe("morning");
    expect(partOfDay(at(12))).toBe("midday");
    expect(partOfDay(at(15))).toBe("afternoon");
    expect(partOfDay(at(23))).toBe("night");
  });
});

describe("throughDay", () => {
  it("measures the way through an ordinary waking day", () => {
    expect(throughDay(at(7), at(7), at(23))).toBe(0);
    expect(throughDay(at(15), at(7), at(23))).toBe(50);
    expect(throughDay(at(23), at(7), at(23))).toBe(100);
  });

  it("survives a day that runs through midnight", () => {
    expect(throughDay(at(0), at(7), at(1))).toBeCloseTo(94.4, 1);
    expect(throughDay(at(20), at(7), at(1))).toBeCloseTo(72.2, 1);
  });

  it("reads as not started rather than as over, before the day opens", () => {
    expect(throughDay(at(5), at(7), at(23))).toBe(0);
  });
});

describe("daysInWords", () => {
  it("says what somebody waiting for it would say", () => {
    expect(daysInWords(0)).toBe("any day now");
    expect(daysInWords(1)).toBe("a day");
    expect(daysInWords(4)).toBe("4 days");
    expect(daysInWords(21)).toBe("3 weeks");
    expect(daysInWords(120)).toBe("4 months");
  });

  it("loses precision as it goes further out, rather than pretending to keep it", () => {
    // "in 34 days" is a promise nobody can make about a milestone.
    expect(daysInWords(34)).toBe("5 weeks");
  });
});

describe("spanInWords", () => {
  it("says hours and minutes the way a person would", () => {
    expect(spanInWords(35)).toBe("35m");
    expect(spanInWords(60)).toBe("1h");
    expect(spanInWords(260)).toBe("4h 20m");
  });
});

describe("wrap", () => {
  it("brings a window that runs past midnight back into the day", () => {
    expect(wrap(at(23, 50) + 20)).toBe(at(0, 10));
    expect(wrap(-30)).toBe(at(23, 30));
  });
});
