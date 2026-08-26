# frozen_string_literal: true

module Terminus
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
