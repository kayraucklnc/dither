# frozen_string_literal: true

module Terminus
  module Views
    module Devices
      # The index view.
      class Index < View
        decorate :devices
        expose :query
      end
    end
  end
end
