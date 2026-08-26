# frozen_string_literal: true

module Dither
  module Views
    module Screens
      module Interrupts
        module Error
          # The show view.
          class Show < Interrupts::Show
            expose :message
          end
        end
      end
    end
  end
end
