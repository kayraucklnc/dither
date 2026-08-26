# frozen_string_literal: true

module Dither
  module Views
    module Extensions
      # The dynamic view.
      class Dynamic < View
        config.layout = "extension"

        expose :screen_variables
        expose :content
      end
    end
  end
end
