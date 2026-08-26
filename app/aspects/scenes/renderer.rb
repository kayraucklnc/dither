# frozen_string_literal: true

require "dry/monads"

module Terminus
  module Aspects
    module Scenes
      # Renders a scene all the way to the bytes a panel would receive.
      #
      # This is the same path a device takes - compose, screenshot, dither - so
      # what the preview shows is what the hardware shows, down to the speckle.
      # Anything that only approximated it would be worse than useless: the
      # whole point is to be able to judge a design before owning a panel.
      class Renderer
        include Deps[
          "aspects.scenes.composer",
          "aspects.screens.mold_builder",
          "aspects.screens.temp_pather"
        ]
        include Dry::Monads[:result]

        Render = Data.define :bytes, :mime_type, :width, :height

        def call layout_id, assignments = {}, model_id: nil, device_id: nil
          composer.call(layout_id, assignments, model_id:, device_id:)
                  .bind { |content| build content, layout_id, model_id:, device_id: }
                  .bind { |mold| capture mold }
        end

        private

        def build content, layout_id, **options
          mold_builder.call(
            label: "Scene preview",
            name: "scene-preview-#{layout_id}",
            content:,
            **options
          )
        end

        def capture mold
          temp_pather.call mold do |path|
            Success Render[
              bytes: path.binread,
              mime_type: mold.mime_type,
              width: mold.width,
              height: mold.height
            ]
          end
        end
      end
    end
  end
end
