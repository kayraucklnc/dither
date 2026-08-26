# frozen_string_literal: true

module Dither
  module Views
    module Devices
      module Logs
        # The index view.
        class Index < View
          expose :device
          decorate :logs, as: Parts::DeviceLog
          expose :query
        end
      end
    end
  end
end
