# frozen_string_literal: true

module Dither
  module Views
    module Screens
      # The index view.
      class Index < View
        decorate :screens
        expose :query
      end
    end
  end
end
