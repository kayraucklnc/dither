# frozen_string_literal: true

module Dither
  module Actions
    module Devices
      module Rules
        # The index action.
        class Index < Action
          include Deps[
            "aspects.scenes.resolver",
            device_repository: "repositories.device",
            rule_repository: "repositories.rule",
            scene_repository: "repositories.scene"
          ]

          params { required(:device_id).filled :integer }

          def handle request, response
            device = device_repository.find request.params[:device_id]

            return response.redirect_to routes.path(:devices) unless device

            rules = rule_repository.for_device device.id

            response.render view,
                            device:,
                            rules:,
                            scenes: scene_repository.all,
                            decision: resolver.call(device),
                            conditions: Conditions::ALL
          end
        end
      end
    end
  end
end
