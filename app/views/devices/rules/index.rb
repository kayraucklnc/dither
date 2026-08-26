# frozen_string_literal: true

module Dither
  module Views
    module Devices
      module Rules
        # The index view.
        class Index < View
          expose :device
          expose :rules
          expose :scenes
          expose :decision
          expose :conditions
        end
      end
    end
  end
end
