# frozen_string_literal: true

module Dither
  module Views
    module Extensions
      # The index view.
      class Index < View
        decorate :extensions
        expose :query
      end
    end
  end
end
