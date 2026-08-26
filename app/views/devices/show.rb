# frozen_string_literal: true

module Dither
  module Views
    module Devices
      # The show view.
      class Show < View
        decorate :device
      end
    end
  end
end
