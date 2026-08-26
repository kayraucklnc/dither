# frozen_string_literal: true

module Dither
  module Actions
    module Dashboard
      # The show action.
      class Show < Action
        include Deps[:settings, firmware_repository: "repositories.firmware"]
        include Initable[ip_finder: proc { Dither::IPFinder.new }]

        def handle _request, response
          response.render view,
                          api_uri: settings.api_uri,
                          firmware: firmware_repository.latest,
                          ip_addresses: ip_finder.all
        end
      end
    end
  end
end
