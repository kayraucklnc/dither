# frozen_string_literal: true

module Terminus
  module Views
    module Devices
      module Logs
        # The show view.
        class Show < View
          expose :device
          decorate :log, as: Parts::DeviceLog
        end
      end
    end
  end
end
