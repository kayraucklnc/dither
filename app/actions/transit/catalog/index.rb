# frozen_string_literal: true

module Terminus
  module Actions
    module Transit
      module Catalog
        # Answers the countries, cities, and providers a transit extension can use.
        class Index < Action
          include Initable[catalog: proc { Terminus::Aspects::Transit::Catalog }]

          def handle _request, response
            response.format = :json
            response.body = {data: catalog.countries}.to_json
          end
        end
      end
    end
  end
end
