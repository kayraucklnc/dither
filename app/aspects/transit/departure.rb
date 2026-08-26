# auto_register: false
# frozen_string_literal: true

module Terminus
  module Aspects
    module Transit
      # A single, provider agnostic departure as rendered on a board.
      #
      # Times are wall clock strings ("HH:MM") because that is all a screen ever
      # shows and because providers disagree on time zones and ISO formats.
      Departure = Data.define :line,
                              :number,
                              :direction,
                              :scheduled,
                              :expected,
                              :delay,
                              :platform,
                              :platform_actual,
                              :arrival,
                              :duration,
                              :changes,
                              :cancelled,
                              :live,
                              :day_offset do
        def initialize line: nil,
                       number: nil,
                       direction: nil,
                       scheduled: nil,
                       expected: nil,
                       delay: 0,
                       platform: nil,
                       platform_actual: false,
                       arrival: nil,
                       duration: nil,
                       changes: 0,
                       cancelled: false,
                       live: false,
                       day_offset: 0
          super
        end

        def delayed? = delay.to_i.positive?

        def direct? = changes.to_i.zero?

        # Answers the single word a board puts in its status column.
        def status
          return "CANCELLED" if cancelled
          return "+#{delay}" if delayed?
          return "ON TIME" if live

          "SCHEDULED"
        end

        def liquid_attributes
          {
            "line" => line,
            "number" => number,
            "direction" => direction,
            "scheduled" => scheduled,
            "expected" => expected,
            "delay" => delay,
            "delayed" => delayed?,
            "platform" => platform,
            "platform_actual" => platform_actual,
            "arrival" => arrival,
            "duration" => duration,
            "changes" => changes,
            "direct" => direct?,
            "cancelled" => cancelled,
            "live" => live,
            "day_offset" => day_offset,
            "status" => status
          }
        end
      end
    end
  end
end
