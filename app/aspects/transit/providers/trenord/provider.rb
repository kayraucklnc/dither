# frozen_string_literal: true

require "core"
require "dry/monads"
require "initable"
require "time"

module Terminus
  module Aspects
    module Transit
      module Providers
        module Trenord
          # The Trenord provider: departure boards and station lookup for Milan.
          class Provider
            include Deps[
              client: "aspects.transit.providers.trenord.client",
              normalizer: "aspects.transit.providers.trenord.normalizer",
              registry: "aspects.transit.providers.trenord.registry"
            ]
            include Initable[
              max_pages: 4,
              origin_stop: proc { Terminus::Aspects::Transit::Providers::Trenord::OriginStop },
              clock: proc { Time.method(:now) }
            ]
            include Dry::Monads[:result]

            def board settings
              collect(settings).fmap { normalizer.call merge(it), settings }
            end

            def stations(query: nil, limit: 25) = registry.call(query:, limit:)

            private

            # The planner answers roughly five journeys per call, so a board
            # asking for more has to walk forward in time. Each page starts a
            # minute after the last journey it saw, and the walk stops as soon
            # as there is enough to show. A default sized board never pages.
            def collect settings, at = nil, payloads = []
              moment = at || settings.departs_at(clock.call)

              journeys(settings, moment).bind do |payload|
                gathered = payloads + [payload]
                following = next_moment payload, moment

                if !following || gathered.size >= max_pages || enough?(gathered, settings)
                  Success gathered
                else
                  collect settings, following, gathered
                end
              end
            end

            def enough?(payloads, settings) = counted(payloads) >= settings.limit

            def counted(payloads) = payloads.sum { Array(it["solutions"]).size }

            def journeys settings, departs_at
              client.journeys(
                origin: settings.origin,
                destination: settings.destination,
                departs_at:,
                transfers: settings.transfers,
                language: settings.language
              )
            end

            def next_moment payload, from
              last = Array(payload["solutions"]).last
              return unless last

              moment = following last

              moment && moment > from ? moment : nil
            end

            def following solution
              iso = origin_stop.call(solution)["dep_date_time"]
              return unless iso

              Time.iso8601(iso) + 60
            rescue ArgumentError
              nil
            end

            # Journeys repeat across pages, so identity is the train and when it runs.
            def merge payloads
              first = payloads.first || Core::EMPTY_HASH

              {
                "hafas_alerts" => Array(first["hafas_alerts"]),
                "solutions" => payloads.flat_map { Array it["solutions"] }
                                       .uniq { signature it }
              }
            end

            def signature solution
              trains = Array(solution["journey_list"]).map { Hash(it["train"])["train_name"] }

              [solution["date"], solution["dep_time"], trains]
            end
          end
        end
      end
    end
  end
end
