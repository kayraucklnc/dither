# frozen_string_literal: true

module Terminus
  # The e-ink screen framework stylesheet.
  #
  # Single source for both the extension layout partial and the fragment
  # wrapper in Aspects::Screens::TempPather, so designs and extension screens
  # cannot drift apart.
  #
  # Re-read per call in development so CSS edits appear on the next render
  # without a restart; memoized otherwise since the file cannot change under a
  # booted production image.
  module ScreenFramework
    PATH = Pathname(__dir__).join("screen_framework.css").freeze

    def self.css
      return PATH.read if Hanami.env?(:development)

      @css ||= PATH.read
    end
  end
end
