# frozen_string_literal: true

module Terminus
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
