# frozen_string_literal: true

module Dither
  module Views
    module Designs
      # The index view.
      class Index < View
        include Deps[model_repository: "repositories.model"]

        expose(:models) { model_repository.all }
        expose :templates
        expose :query
      end
    end
  end
end
