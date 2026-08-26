# frozen_string_literal: true

module Dither
  module Views
    module Extensions
      # The index view.
      class Index < View
        include Deps[model_repository: "repositories.model"]

        decorate :extensions
        expose :query

        # Thumbnails render at a real panel size, so the list shows what each
        # extension actually looks like rather than only what it is called.
        expose :preview_model do
          model_repository.all.find { it.width == 800 && it.height == 480 } ||
            model_repository.all.first
        end
      end
    end
  end
end
