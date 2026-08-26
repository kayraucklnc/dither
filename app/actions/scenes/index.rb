# frozen_string_literal: true

module Dither
  module Actions
    module Scenes
      # The index action.
      class Index < Action
        include Deps[repository: "repositories.scene"]

        def handle(_request, response) = response.render(view, scenes: repository.all)
      end
    end
  end
end
