# frozen_string_literal: true

module Dither
  module Actions
    module Devices
      module Rules
        # Moves a rule up or down the priority order.
        class Reorder < Action
          include Deps[repository: "repositories.rule"]

          def handle request, response
            parameters = request.params
            device_id = parameters[:device_id].to_i
            ids = repository.for_device(device_id).map(&:id)
            index = ids.index parameters[:id].to_i

            swap ids, index, parameters[:direction].to_s
            repository.reorder device_id, ids

            response.redirect_to routes.path(:device_rules, device_id:)
          end

          private

          def swap ids, index, direction
            return unless index

            target = direction == "up" ? index - 1 : index + 1

            return if target.negative? || target >= ids.size

            ids[index], ids[target] = ids[target], ids[index]
          end
        end
      end
    end
  end
end
