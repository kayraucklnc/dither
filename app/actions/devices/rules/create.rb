# frozen_string_literal: true

module Dither
  module Actions
    module Devices
      module Rules
        # The create action.
        class Create < Action
          include Deps[repository: "repositories.rule"]

          def handle request, response
            parameters = request.params
            device_id = parameters[:device_id].to_i
            scene_id = parameters[:scene_id].to_i
            kind = parameters[:condition_kind].to_s

            if scene_id.zero? || !Conditions.kind?(kind)
              response.flash[:alert] = "Pick a scene and a condition."
              return response.redirect_to routes.path(:device_rules, device_id:)
            end

            repository.create_last(
              device_id:,
              scene_id:,
              condition_kind: kind,
              settings: settings_from(kind, parameters),
              refresh_rate: refresh_from(parameters)
            )

            response.flash[:notice] = "Rule added."
            response.redirect_to routes.path(:device_rules, device_id:)
          end

          private

          # Only the fields the chosen condition declares are kept, so switching
          # kinds in the form cannot leave a stale setting behind that silently
          # changes what the rule means.
          def settings_from kind, parameters
            supplied = Hash parameters[:settings]

            Conditions.kind(kind).fields.each.with_object({}) do |field, all|
              value = supplied[field.key.to_sym] || supplied[field.key]
              all[field.key] = coerce field, value
            end
          end

          def coerce field, value
            case field.kind
              when "number" then value.to_i
              when "days" then Array(value).map(&:to_s).reject(&:empty?)
              else value.to_s
            end
          end

          def refresh_from parameters
            minutes = parameters[:refresh_minutes].to_i

            minutes.positive? ? minutes * 60 : nil
          end
        end
      end
    end
  end
end
