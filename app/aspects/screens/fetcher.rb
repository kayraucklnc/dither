# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Screens
      # Answers the screen a device should be showing.
      #
      # A device with no rules yet, or none that match, is not an error - it is
      # a panel nobody has finished setting up. It gets the welcome screen,
      # which says so, rather than a failure that would leave whatever was on
      # the glass before. A panel showing stale departures is worse than one
      # saying it has nothing to show.
      class Fetcher
        include Deps[
          "aspects.screens.interrupts.sleep",
          "aspects.screens.interrupts.welcome",
          "aspects.scenes.resolver",
          "aspects.scenes.publisher"
        ]
        include Dry::Monads[:result]

        def call device
          return sleep.call device if device.asleep?

          resolved = resolver.call(device)
                             .bind { |decision| publisher.call decision.scene, device: }

          resolved.success? ? resolved : welcome.call(device)
        end
      end
    end
  end
end
