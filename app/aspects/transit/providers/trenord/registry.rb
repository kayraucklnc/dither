# frozen_string_literal: true

require "dry/monads"
require "initable"

module Terminus
  module Aspects
    module Transit
      module Providers
        module Trenord
          # The station registry, held in memory and searched locally.
          #
          # A few hundred stations that change about never. Fetching once per
          # process makes a typeahead free and means Trenord sees one request a
          # day instead of one per keystroke.
          class Registry
            include Deps[client: "aspects.transit.providers.trenord.client"]
            include Initable[lifetime: 86_400, clock: proc { Time.method(:now) }]
            include Dry::Monads[:result]

            def initialize(**)
              @records = nil
              @fetched_at = nil
              super
            end

            def call query: nil, limit: 25
              load.fmap { search it, query, limit }
            end

            private

            attr_reader :records, :fetched_at

            def load
              return Success records if fresh?

              client.stations.fmap do |raw|
                @records = raw.filter_map { station it }
                @fetched_at = clock.call
                records
              end
            end

            def fresh? = records && fetched_at && (clock.call - fetched_at) < lifetime

            def search all, query, limit
              pattern = query.to_s.strip.downcase
              return all.take limit if pattern.empty?

              all.select { it.name.downcase.include? pattern }
                 .sort_by { [it.name.downcase.start_with?(pattern) ? 0 : 1, it.name] }
                 .take(limit)
            end

            def station record
              name = presence record["NomeGeoStazioni"]
              return unless name

              Station[
                code: presence(record["CodiceMIR"]),
                name:,
                city: presence(record["Comune"]),
                region: presence(record["Regione"]),
                country: presence(record["country"]) || "it",
                platforms: Array(record["platforms"])
              ]
            end

            def presence value
              stripped = String(value).strip
              stripped.empty? ? nil : stripped
            end
          end
        end
      end
    end
  end
end
