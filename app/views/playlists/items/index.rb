# frozen_string_literal: true

module Dither
  module Views
    module Playlists
      module Items
        # The index view.
        class Index < View
          expose :playlist_id
          decorate :items
          expose :query
        end
      end
    end
  end
end
