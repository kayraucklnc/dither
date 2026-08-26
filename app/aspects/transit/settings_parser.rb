# frozen_string_literal: true

require "core"
require "dry/monads"
require "initable"

module Terminus
  module Aspects
    module Transit
      # Turns the free form values of an extension into validated settings.
      class SettingsParser
        include Initable[
          schema: proc { Terminus::Schemas::Transit::Settings },
          catalog: proc { Terminus::Aspects::Transit::Catalog }
        ]
        include Dry::Monads[:result]

        def initialize(error_joiner: Errors::ResultJoiner, **)
          @error_joiner = error_joiner
          super(**)
        end

        def call values
          schema.call(symbolize(values))
                .to_monad
                .alt_map { error_joiner.call "Transit", it }
                .fmap { Settings[**it.to_h] }
                .bind { verify it }
                .fmap { with_timezone it }
        end

        private

        attr_reader :error_joiner

        def symbolize values
          Hash(values).each.with_object({}) { |(key, value), all| all[key.to_sym] = value }
        end

        def verify settings
          return Success settings if supported? settings

          Failure "Unsupported transit provider: " \
                  "#{settings.country}/#{settings.city}/#{settings.provider}."
        end

        def supported? settings
          catalog.supports? settings.country, settings.city, settings.provider
        end

        # The catalog owns the time zone; a screen owner should never type it.
        def with_timezone settings
          zone = Hash(catalog.city(settings.country, settings.city))["timezone"]

          zone ? settings.with(timezone: zone) : settings
        end
      end
    end
  end
end
