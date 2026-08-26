# auto_register: false
# frozen_string_literal: true

module Dither
  module Aspects
    module Transit
      # The catalog of supported countries, cities, and transit providers.
      #
      # Adding a city means adding an entry here plus a provider under
      # +app/aspects/transit/providers+. Nothing else knows about Milan.
      module Catalog
        COUNTRIES = [
          {
            "code" => "it",
            "label" => "Italy",
            "cities" => [
              {
                "code" => "milan",
                "label" => "Milan",
                "timezone" => "Europe/Rome",
                "providers" => [
                  {
                    "code" => "trenord",
                    "label" => "Trenord",
                    "mode" => "rail",
                    "description" => "Regional and suburban trains across Lombardy.",
                    "shape" => "journey",
                    "searchable_stations" => true
                  }
                ]
              }
            ]
          }
        ].freeze

        def self.countries = COUNTRIES

        def self.country(code) = COUNTRIES.find { it["code"] == code }

        def self.cities(country_code) = Hash(country(country_code)).fetch("cities", [])

        def self.city country_code, city_code
          cities(country_code).find { it["code"] == city_code }
        end

        def self.providers country_code, city_code
          Hash(city(country_code, city_code)).fetch "providers", []
        end

        def self.provider country_code, city_code, provider_code
          providers(country_code, city_code).find { it["code"] == provider_code }
        end

        def self.supports? country_code, city_code, provider_code
          !provider(country_code, city_code, provider_code).nil?
        end
      end
    end
  end
end
