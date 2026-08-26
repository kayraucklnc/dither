# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Transit
      # Routes a transit request to the provider that can answer it.
      class Finder
        include Deps[
          "aspects.transit.settings_parser",
          trenord: "aspects.transit.providers.trenord.provider"
        ]
        include Dry::Monads[:result]

        def call values
          settings_parser.call(values).bind { board it }
        end

        def stations provider:, query: nil, limit: 25
          case provider
            when "trenord" then trenord.stations(query:, limit:)
            else Failure "Unknown transit provider: #{provider}."
          end
        end

        private

        def board settings
          case settings.provider
            when "trenord" then trenord.board settings
            else Failure "Unknown transit provider: #{settings.provider}."
          end
        end
      end
    end
  end
end
