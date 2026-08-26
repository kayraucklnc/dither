# frozen_string_literal: true

require "dry/monads"
require "initable"
require "json"

module Terminus
  module Aspects
    module Transit
      module Providers
        module Trenord
          # Talks to Trenord's unauthenticated backend-for-frontend.
          #
          # Two endpoints, two shapes. The journey planner answers AES encrypted
          # bytes; the station registry answers plain JSON. Neither needs a
          # token, but both sit behind Akamai, so the browser-ish headers stay.
          class Client
            include Deps[:http, cipher: "aspects.transit.providers.trenord.cipher"]
            include Initable[
              journeys_uri: "https://www.trenord.it/mia/bff/hafas/v2",
              stations_uri: "https://www.trenord.it/mia/v2/stazioni_v2/",
              user_agent: "Mozilla/5.0 (compatible; Dither/1.0; +https://github.com/kayraucklnc/dither)",
              journey_defaults: {products: "tickets", live_data: "true", with_routes: "true"},
              station_defaults: {
                _p: "NomeGeoStazioni,CodiceMIR,Comune,Regione,country,platforms,MetaStazione",
                _s: "NomeGeoStazioni",
                ignore_during_search: "false"
              }
            ]
            include Dry::Monads[:result]

            def journeys origin:, destination:, departs_at:, transfers: 1, language: "en"
              params = journey_params origin, destination, departs_at, transfers, language

              get(journeys_uri, params, language).bind { cipher.call it.to_s }
            end

            # Answers stations whose name matches, or the whole registry when blank.
            def stations query: nil
              params = station_defaults.dup
              params[:_q] = name_query query unless query.to_s.strip.empty?

              get(stations_uri, params, "it").bind { decode it }
            end

            private

            def journey_params origin, destination, departs_at, transfers, language
              {
                orig: origin,
                dest: destination,
                departure_date: departs_at.strftime("%Y%m%d"),
                departure_hour: departs_at.strftime("%H:%M"),
                transfers:,
                language:,
                **journey_defaults
              }
            end

            def get uri, params, language
              response = http.headers(headers(language)).follow.get(uri, params:)

              return Success response.body if response.status.success?

              Failure "Trenord answered #{response.code} for #{uri}."
            rescue ::HTTP::RequestError then Failure "Unable to request #{uri}."
            rescue ::HTTP::ConnectionError then Failure "Unable to connect to #{uri}."
            rescue ::HTTP::TimeoutError then Failure "Timed out connecting to #{uri}."
            rescue OpenSSL::SSL::SSLError then Failure "Unable to secure connection to #{uri}."
            end

            def headers language
              {
                "Accept" => "application/json, text/plain, */*",
                "Referer" => "https://www.trenord.it/store/",
                "User-Agent" => user_agent,
                "X-3N-Language" => language
              }
            end

            def name_query query
              %({"NomeGeoStazioni": {"$regex": "#{escape query}", "$options": "i"}})
            end

            # The value is interpolated into both JSON and a regular expression,
            # so anything that could break out of either has to go.
            def escape(query) = query.to_s.gsub(/[^[:alnum:][:space:]'.-]/, " ").strip

            def decode body
              Success JSON(body.to_s)
            rescue ::JSON::ParserError
              Failure "Trenord station registry answered malformed JSON."
            end
          end
        end
      end
    end
  end
end
