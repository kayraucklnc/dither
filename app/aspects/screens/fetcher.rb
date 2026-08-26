# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Screens
      # Fetches a device's current screen.
      class Fetcher
        include Deps[
          "aspects.screens.interrupts.sleep",
          "aspects.scenes.resolver",
          "aspects.scenes.publisher"
        ]
        include Dry::Monads[:result]

        def call device
          return sleep.call device if device.asleep?

          resolver.call(device).bind { |decision| publisher.call decision.scene, device: }
        end
      end
    end
  end
end
