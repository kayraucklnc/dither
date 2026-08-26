# frozen_string_literal: true

module Dither
  module Actions
    module Scenes
      module Preview
        # Renders a composed scene as the image a panel would receive.
        class Show < Action
          # Panels are PNG or BMP depending on the model; neither is a format
          # Hanami knows by default. Registered rather than accepted, so a
          # browser asking for HTML still gets the image instead of a 406.
          config.formats.register :png, "image/png"
          config.formats.register :bmp, "image/bmp"

          include Deps["aspects.scenes.renderer", scene_repository: "repositories.scene"]

          # Renders either a saved scene by id, or a composition in progress
          # from its layout and slots. The composer needs the second; every
          # place that lets you pick a scene needs the first, because picking
          # one from a dropdown you cannot see is guesswork.
          def handle request, response
            result = saved(request.params) || composed(request.params)

            result.either -> render { send_image response, render },
                          -> failure { send_failure response, failure }
          end

          private

          def saved parameters
            scene = scene_repository.find parameters[:id]

            return nil unless scene

            renderer.call scene.layout,
                          scene.assignments,
                          model_id: parameters[:model_id] || scene.model_id,
                          preview: true
          end

          def composed parameters
            slots = Hash(parameters[:slots]).transform_keys(&:to_s)
                                            .transform_values(&:to_i)
                                            .reject { |_, id| id.zero? }

            renderer.call parameters[:layout], slots, model_id: parameters[:model_id], preview: true
          end

          def send_image response, render
            response.format = render.mime_type.include?("bmp") ? :bmp : :png
            # A preview is a snapshot of live data; caching it would show the
            # last render after the underlying data has already moved on.
            response.headers["Cache-Control"] = "no-store"
            response.body = render.bytes
          end

          def send_failure response, failure
            response.status = 422
            response.format = :json
            response.body = {error: failure}.to_json
          end
        end
      end
    end
  end
end
