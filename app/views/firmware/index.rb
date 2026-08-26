# frozen_string_literal: true

module Terminus
  module Views
    module Firmware
      # The index view.
      class Index < View
        decorate :firmware
        expose :query
      end
    end
  end
end
