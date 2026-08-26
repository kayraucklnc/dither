# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Scenes
      # Renders a scene and stores it as the screen a device will be served.
      #
      # The device API hands out an image URL, so a resolved scene has to become
      # a real screen record before it can be shown. Upserting by name means a
      # device keeps one screen row that gets overwritten, rather than growing a
      # new one on every wake.
      class Publisher
        include Deps["aspects.scenes.composer", "aspects.screens.upserter"]
        include Dry::Monads[:result]

        def call scene, device: nil, model_id: nil
          composer.call(scene.layout, scene.assignments, model_id:, device_id: device&.id)
                  .bind { |content| publish scene, content, device, model_id }
        end

        private

        def publish scene, content, device, model_id
          upserter.call model_id: model_id || device&.model_id,
                        device_id: device&.id,
                        label: scene.label,
                        name: name_for(scene, device),
                        kind: "general",
                        content: String.new(content)
        end

        # Scoped to the device so two panels showing the same scene at different
        # sizes do not overwrite each other's render.
        def name_for scene, device
          device ? "scene-#{scene.name}-device-#{device.id}" : "scene-#{scene.name}"
        end
      end
    end
  end
end
