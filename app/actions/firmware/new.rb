# frozen_string_literal: true

module Dither
  module Actions
    module Firmware
      # The new action.
      class New < Action
        include Deps[:htmx_layout]

        def handle request, response
          response.render view, fields: {kind: "dither"}, layout: htmx_layout.call(request)
        end
      end
    end
  end
end
