# frozen_string_literal: true

module Terminus
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
