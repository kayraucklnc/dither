# frozen_string_literal: true

module Dither
  module Views
    module Users
      # The index view.
      class Index < View
        decorate :users
        expose :query
      end
    end
  end
end
