# auto_register: false
# frozen_string_literal: true

module Terminus
  module Aspects
    module Transit
      # A rendered departure board: where from, where to, and what is leaving.
      Board = Data.define :origin,
                          :destination,
                          :provider,
                          :city,
                          :country,
                          :departures,
                          :alerts,
                          :queried_at do
        def initialize origin:,
                       provider:,
                       city:,
                       country:,
                       destination: nil,
                       departures: [],
                       alerts: [],
                       queried_at: nil
          super
        end

        def empty? = departures.empty?

        def liquid_attributes
          {
            "origin" => origin,
            "destination" => destination,
            "provider" => provider,
            "city" => city,
            "country" => country,
            "queried_at" => queried_at,
            "empty" => empty?,
            "departures" => departures.map(&:liquid_attributes),
            "alerts" => alerts.map(&:liquid_attributes)
          }
        end
      end
    end
  end
end
