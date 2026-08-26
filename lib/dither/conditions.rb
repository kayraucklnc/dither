# frozen_string_literal: true

module Dither
  # The condition vocabulary: the closed set of questions a rule can ask.
  #
  # A condition is a kind plus a bag of settings, so adding one is an entry
  # here and a form field, never a migration. Each kind declares the fields it
  # needs, which is what lets the rule editor build itself out of dropdowns
  # instead of asking anyone to type an expression.
  #
  # There is deliberately no OR and no nesting. Two alternatives means two
  # rules. That keeps every rule readable at a glance, and keeps the editor a
  # handful of selects.
  module Conditions
    Field = Data.define :key, :label, :kind, :default, :hint

    Kind = Data.define :id, :label, :summary, :fields, :evaluator do
      # Answers whether this condition holds for a device right now.
      def holds? device, settings, now
        evaluator.call device, Hash(settings).transform_keys(&:to_s), now
      end

      def describe settings
        summary.call Hash(settings).transform_keys(&:to_s)
      end
    end

    WEEKDAYS = %w[monday tuesday wednesday thursday friday saturday sunday].freeze

    # Minutes since midnight, so a window that wraps past midnight still works.
    def self.minutes_of(time) = (time.hour * 60) + time.min

    def self.parse_clock value
      hour, minute = value.to_s.split(":").map(&:to_i)
      ((hour || 0) * 60) + (minute || 0)
    end

    ALWAYS = Kind[
      id: "always",
      label: "Always",
      summary: proc { "always" },
      fields: [],
      evaluator: proc { |_device, _settings, _now| true }
    ]

    BETWEEN = Kind[
      id: "time_between",
      label: "Between two times",
      summary: proc { |it| "between #{it.fetch "from", "00:00"} and #{it.fetch "to", "23:59"}" },
      fields: [
        Field[key: "from", label: "From", kind: "time", default: "07:00", hint: "24 hour clock."],
        Field[key: "to", label: "To", kind: "time", default: "09:30", hint: "May wrap past midnight."]
      ],
      evaluator: proc { |_device, settings, now|
        from = Conditions.parse_clock settings.fetch("from", "00:00")
        to = Conditions.parse_clock settings.fetch("to", "23:59")
        minute = Conditions.minutes_of now

        # A window like 22:00 to 06:00 is inside-out rather than empty.
        from <= to ? minute >= from && minute <= to : minute >= from || minute <= to
      }
    ]

    WEEKDAY = Kind[
      id: "weekday",
      label: "On certain days",
      summary: proc { |it|
        days = Array it["days"]
        days.empty? ? "on no days" : "on #{days.map(&:capitalize).join ", "}"
      },
      fields: [
        Field[key: "days", label: "Days", kind: "days", default: %w[monday tuesday wednesday thursday friday],
              hint: nil]
      ],
      evaluator: proc { |_device, settings, now|
        Array(settings["days"]).map(&:to_s).include? WEEKDAYS[(now.wday + 6) % 7]
      }
    ]

    BATTERY_BELOW = Kind[
      id: "battery_below",
      label: "Battery below",
      summary: proc { |it| "battery below #{it.fetch "percent", 20}%" },
      fields: [
        Field[key: "percent", label: "Percent", kind: "number", default: 20, hint: "0 to 100."]
      ],
      evaluator: proc { |device, settings, _now|
        !device.charging && device.battery_percentage.to_f < settings.fetch("percent", 20).to_f
      }
    ]

    CHARGING = Kind[
      id: "charging",
      label: "While charging",
      summary: proc { "while charging" },
      fields: [],
      evaluator: proc { |device, _settings, _now| !!device.charging }
    ]

    OFFLINE_SINCE = Kind[
      id: "stale",
      label: "Data has gone stale",
      summary: proc { |it| "no check in for #{it.fetch "minutes", 60} minutes" },
      fields: [
        Field[key: "minutes", label: "Minutes", kind: "number", default: 60, hint: nil]
      ],
      evaluator: proc { |device, settings, now|
        synced = device.synced_at
        synced.nil? || (now - synced) > (settings.fetch("minutes", 60).to_f * 60)
      }
    ]

    WIFI_BELOW = Kind[
      id: "wifi_below",
      label: "Signal below",
      summary: proc { |it| "signal below #{it.fetch "percent", 30}%" },
      fields: [
        Field[key: "percent", label: "Percent", kind: "number", default: 30, hint: "0 to 100."]
      ],
      evaluator: proc { |device, settings, _now|
        device.wifi_percentage.to_f < settings.fetch("percent", 30).to_f
      }
    ]

    # The open one. Any extension that declares facts becomes a trigger source
    # without the rule engine learning anything about what it does: a calendar
    # connector publishing "next meeting starts in" gives you commute triggers,
    # and nothing here changes.
    #
    # Evaluated through a reader rather than inline, because values live on the
    # extension's exchanges.
    EXTENSION_FACT = Kind[
      id: "extension_fact",
      label: "Something an extension knows",
      summary: proc { |it|
        subject = it["fact_label"].to_s.empty? ? it["fact"].to_s.tr("_", " ") : it["fact_label"]
        operator = Facts.operator it["operator"]
        phrase = operator ? operator.label : "is"
        value = operator && !operator.value? ? nil : it["value"]

        ["#{it["extension_label"] || "an extension"}:", subject, phrase, value].compact.join(" ").strip
      },
      fields: [],
      evaluator: proc { |_device, settings, _now|
        Conditions.extension_fact_holds? settings
      }
    ]

    ALL = [
      ALWAYS,
      BETWEEN,
      WEEKDAY,
      EXTENSION_FACT,
      BATTERY_BELOW,
      CHARGING,
      WIFI_BELOW,
      OFFLINE_SINCE
    ].freeze
    BY_ID = ALL.to_h { [it.id, it] }.freeze
    DEFAULT = ALWAYS.id

    def self.kind(id) = BY_ID.fetch id.to_s, nil

    def self.kind?(id) = BY_ID.key? id.to_s

    def self.ids = ALL.map(&:id)

    # Answers whether a rule's condition holds, defaulting to false for a kind
    # we no longer recognise: a rule nobody can explain should not take over a
    # panel.
    def self.holds? kind_id, device, settings, now: Time.now
      found = kind kind_id

      found ? found.holds?(device, settings, now) : false
    end

    # Resolved through the container so the vocabulary stays a plain module
    # while still reaching the repositories a fact needs.
    def self.extension_fact_holds? settings
      extension = Hanami.app["repositories.extension"].find settings["extension_id"]

      return false unless extension

      actual = Hanami.app["aspects.extensions.fact_reader"].value extension, settings["fact"]

      Facts.compare actual, settings["operator"], settings["value"]
    end

    def self.describe kind_id, settings
      found = kind kind_id

      found ? found.describe(settings) : "unknown condition"
    end
  end
end
