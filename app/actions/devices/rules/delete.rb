# frozen_string_literal: true

module Dither
  module Actions
    module Devices
      module Rules
        # The delete action.
        class Delete < Action
          include Deps[repository: "repositories.rule"]

          params do
            required(:device_id).filled :integer
            required(:id).filled :integer
          end

          def handle request, response
            parameters = request.params
            repository.delete parameters[:id]
            response.flash[:notice] = "Rule removed."
            response.redirect_to routes.path(:device_rules, device_id: parameters[:device_id])
          end
        end
      end
    end
  end
end
