# frozen_string_literal: true

module Dither
  module Views
    module Playlists
      module Mirror
        # The edit view.
        class Edit < View
          expose :playlist
          expose :devices
        end
      end
    end
  end
end
