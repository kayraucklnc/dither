# frozen_string_literal: true

require "core"
require "initable"

module Dither
  module Aspects
    module Transit
      module Providers
        module Trenord
          # Turns a decrypted journey planner payload into a departure board.
          #
          # Trenord ships two different stop vocabularies. Trains with live data
          # carry their whole run, typed "O"/"F"/"D", with platforms and actual
          # times; trains without it carry only the legs of your journey, typed
          # "start"/"pass"/"end", with neither. Both are matched on station code.
          class Normalizer
            include Deps[builder: "aspects.transit.providers.trenord.departure_builder"]
            include Initable[
              moment: proc { Dither::Aspects::Transit::Providers::Trenord::Moment },
              alerts: proc { Dither::Aspects::Transit::Providers::Trenord::Alerts },
              now: proc { Time.method(:now) }
            ]

            def call payload, settings
              at = moment[settings:, at: now.call]
              solutions = Array Hash(payload)["solutions"]

              Board[
                **route(solutions, settings),
                departures: departures(solutions, at),
                alerts: alerts.call(payload, settings.language),
                queried_at: at.local.strftime("%H:%M")
              ]
            end

            private

            def route solutions, settings
              {
                origin: station_name(solutions, "dep_station", settings.origin),
                destination: station_name(solutions, "arr_station", settings.destination),
                provider: settings.provider,
                city: settings.city,
                country: settings.country
              }
            end

            def departures solutions, at
              settings = at.settings

              solutions.filter_map { builder.call it, at }
                       .reject { settings.hide_cancelled && it.cancelled }
                       .take(settings.limit)
            end

            def station_name solutions, key, fallback
              solutions.filter_map { Hash(Hash(it)[key])["station_ori_name"] }
                       .first || fallback
            end
          end
        end
      end
    end
  end
end
