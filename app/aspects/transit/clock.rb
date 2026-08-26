# auto_register: false
# frozen_string_literal: true

require "functionable"

module Terminus
  module Aspects
    module Transit
      # Wall clock arithmetic, in the only form a screen cares about: "HH:MM".
      #
      # Providers quote local times as strings, so this stays in strings rather
      # than round-tripping through Time and inheriting a time zone by accident.
      module Clock
        MINUTES_PER_DAY = 1_440

        extend Functionable

        # Answers the leading "HH:MM" of anything clock shaped, or nil.
        def call(value) = String(value)[/\A(\d{2}:\d{2})/, 1]

        def minutes clock_time
          hours, mins = clock_time.split(":").map(&:to_i)

          (hours * 60) + mins
        end

        def shift clock_time, late
          total = (minutes(clock_time) + late) % MINUTES_PER_DAY

          format "%<hours>02d:%<mins>02d", hours: total / 60, mins: total % 60
        end

        # Answers minutes from one clock time to another, treating a large gap
        # as an earlier time rather than a near day long delay.
        def between from, to
          difference = (minutes(to) - minutes(from)) % MINUTES_PER_DAY

          difference < (MINUTES_PER_DAY / 2) ? difference : 0
        end

        def duration value
          parsed = call value
          return unless parsed

          hours, mins = parsed.split(":").map(&:to_i)
          hours.zero? ? "#{mins}m" : format("%<hours>dh%<mins>02d", hours:, mins:)
        end
      end
    end
  end
end
