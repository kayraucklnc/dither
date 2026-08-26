# frozen_string_literal: true

require "hanami/view"

module Terminus
  module Views
    module Parts
      # The device presenter.
      class Device < Hanami::View::Part
        include Deps["aspects.screens.fetcher", "aspects.screens.placeholder"]

        def battery_measurement_label
          return "Charging" if charging

          "Battery (#{helpers.format_number battery_percentage, precision: 0}%)"
        end

        def formatted_display_profile = display_profile.capitalize

        def formatted_touch_bar = touch_bar.capitalize

        def translated_command = helpers.translate "devices.shared._fields.commands.#{command}"

        def wake_description = String(wake_reason).empty? ? "Unknown." : wake_reason

        def wifi_measurement_label
          band = wifi_band
          band.zero? ? "WiFi (#{wifi_percentage}%)" : "#{band} GHz (#{wifi_percentage}%)"
        end

        def dimensions = "#{width}x#{height}"

        # A device only phones home every refresh_rate seconds, so "online" has
        # to be judged against its own cadence rather than a fixed window. One
        # missed check-in is stale; several is offline.
        def presence_state
          return "offline" unless synced_at

          elapsed = Time.now - synced_at
          window = refresh_rate.to_i.positive? ? refresh_rate.to_i : 900

          return "online" if elapsed <= window * 1.5
          return "stale" if elapsed <= window * 4

          "offline"
        end

        def last_seen_label = synced_at ? "#{humanize_seconds Time.now - synced_at} ago" : "never"

        def next_refresh_label
          return "unknown" unless synced_at

          window = refresh_rate.to_i.positive? ? refresh_rate.to_i : 900
          remaining = (synced_at + window) - Time.now

          remaining.negative? ? "overdue" : "in #{humanize_seconds remaining}"
        end

        def battery_low? = !charging && battery_percentage < 20

        def humanize_seconds seconds
          seconds = seconds.to_i.abs

          case seconds
            when 0...60 then "#{seconds}s"
            when 60...3_600 then "#{seconds / 60} min"
            when 3_600...86_400 then "#{seconds / 3_600} hr"
            else "#{seconds / 86_400}d"
          end
        end

        def current_screen
          fetcher.call(value).either -> screen { screen },
                                     proc { placeholder.with id: id }
        end
      end
    end
  end
end
