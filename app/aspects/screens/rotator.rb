# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Screens
      # Answers the screen a device should be showing, and renders it.
      #
      # Named for what it used to do - rotate through a playlist. It now asks
      # the rules which scene applies and renders that, which is the same
      # question with a better answer.
      class Rotator
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
