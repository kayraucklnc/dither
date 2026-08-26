# frozen_string_literal: true

module Dither
  module Actions
    module Transit
      module Stations
        # Answers stations matching a query, for a station picker to autocomplete against.
        class Index < Action
          include Deps["aspects.transit.finder"]

          params do
            required(:provider).filled :string
            optional(:query).maybe :string
          end

          def handle request, response
            response.format = :json

            render search(request.params), response
          end

          private

          def search parameters
            attributes = parameters.to_h

            finder.stations provider: attributes[:provider], query: attributes[:query]
          end

          def render result, response
            return response.body = found(result.value!) if result.success?

            response.status = 422
            response.body = {error: result.failure}.to_json
          end

          def found(stations) = {data: stations.map(&:to_h_for_json)}.to_json
        end
      end
    end
  end
end
