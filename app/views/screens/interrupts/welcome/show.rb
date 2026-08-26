# frozen_string_literal: true

module Dither
  module Views
    module Screens
      module Interrupts
        module Welcome
          # The show view.
          class Show < Interrupts::Show
            expose :device
          end
        end
      end
    end
  end
end
