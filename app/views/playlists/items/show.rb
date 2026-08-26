# frozen_string_literal: true

module Terminus
  module Views
    module Playlists
      module Items
        # The show view.
        class Show < View
          decorate :item
        end
      end
    end
  end
end
