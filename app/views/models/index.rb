# frozen_string_literal: true

module Dither
  module Views
    module Models
      # The index view.
      class Index < View
        decorate :models
        expose :query
      end
    end
  end
end
