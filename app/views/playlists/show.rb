# frozen_string_literal: true

module Dither
  module Views
    module Playlists
      # The show view.
      class Show < View
        decorate :playlist
        decorate :items
      end
    end
  end
end
