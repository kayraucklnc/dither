# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Screens
      # Answers the screen a device should be showing, and renders it.
      #
      # Named for what it used to do, which was rotate through a playlist. It
      # now asks the rules which scene applies - the same question, answered by
      # the conditions on the device rather than by position in a list.
      class Rotator
        include Deps["aspects.screens.fetcher"]
        include Dry::Monads[:result]

        def call(device) = fetcher.call device
      end
    end
  end
end
