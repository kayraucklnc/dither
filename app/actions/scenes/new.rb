# frozen_string_literal: true

module Terminus
  module Actions
    module Scenes
      # The new action.
      class New < Action
        include Deps[
          extension_repository: "repositories.extension",
          model_repository: "repositories.model"
        ]

        def handle request, response
          models = model_repository.all
          model = selected_model models, request.params[:model_id]
          scene_layout = Composition.layout(request.params[:layout]) ||
                         Composition.layout(Composition::DEFAULT_LAYOUT)

          response.render view, extensions: extension_repository.all,
                                models:,
                                model:,
                                scene_layout:
        end

        private

        # Prefers a panel the size of the hardware this is aimed at, so the
        # first thing anyone sees is composed at the size they will own.
        def selected_model models, id
          return models.find { it.id == id.to_i } || models.first if id

          models.find { it.width == 800 && it.height == 480 } || models.first
        end
      end
    end
  end
end
