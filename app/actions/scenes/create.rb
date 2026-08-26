# frozen_string_literal: true

module Dither
  module Actions
    module Scenes
      # The create action.
      class Create < Action
        include Deps[
          repository: "repositories.scene",
          slot_repository: "repositories.scene_slot"
        ]

        def handle request, response
          parameters = request.params
          label = parameters[:label].to_s.strip
          layout = parameters[:layout].to_s

          if label.empty? || !Composition.layout?(layout)
            response.flash[:alert] = "A scene needs a name and a known layout."
            return response.redirect_to routes.path(:scene_new, layout:)
          end

          save response, label, layout, parameters
        end

        private

        def save response, label, layout, parameters
          scene = repository.create(
            label:,
            name: slugify(label),
            layout:,
            model_id: presence(parameters[:model_id])
          )

          slot_repository.replace scene.id, slots_from(parameters)
          response.flash[:notice] = "Saved #{label}."
          response.redirect_to routes.path(:scenes)
        rescue ROM::SQL::UniqueConstraintError
          response.flash[:alert] = "A scene called #{label} already exists."
          response.redirect_to routes.path(:scene_new, layout:)
        end

        def slots_from parameters
          Hash(parameters[:slots]).transform_keys(&:to_s)
                                  .transform_values { presence it }
        end

        def presence value
          number = value.to_i

          number.zero? ? nil : number
        end

        def slugify(label) = label.downcase.strip.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
      end
    end
  end
end
