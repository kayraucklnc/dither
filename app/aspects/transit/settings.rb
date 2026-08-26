# auto_register: false
# frozen_string_literal: true

require "tzinfo"

module Dither
  module Aspects
    module Transit
      # What a transit extension asks its provider for.
      #
      # The time zone comes from the catalog rather than the user, and it
      # matters: providers quote local wall clock times, while a self-hosted
      # server usually runs in UTC. Asking Trenord for "21:28" from a UTC box
      # silently returns trains from two hours ago.
      Settings = Data.define :country,
                             :city,
                             :provider,
                             :origin,
                             :destination,
                             :lead_time,
                             :limit,
                             :transfers,
                             :language,
                             :title,
                             :show_platform,
                             :hide_cancelled,
                             :timezone do
        def initialize origin:,
                       country: "it",
                       city: "milan",
                       provider: "trenord",
                       destination: nil,
                       lead_time: 0,
                       limit: 5,
                       transfers: 1,
                       language: "en",
                       title: nil,
                       show_platform: true,
                       hide_cancelled: false,
                       timezone: "UTC"
          super
        end

        def label = title || [origin, destination].compact.join(" to ")

        # Local wall clock at the origin station.
        def now(clock = Time.now) = zone.to_local clock

        def departs_at(clock = Time.now) = now(clock) + (lead_time * 60)

        private

        def zone
          TZInfo::Timezone.get timezone
        rescue TZInfo::InvalidTimezoneIdentifier
          TZInfo::Timezone.get "UTC"
        end
      end
    end
  end
end
