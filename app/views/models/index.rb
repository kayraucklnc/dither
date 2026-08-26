# frozen_string_literal: true

module Terminus
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
