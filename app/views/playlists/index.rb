# frozen_string_literal: true

module Terminus
  module Views
    module Playlists
      # The index view.
      class Index < View
        decorate :playlists
        expose :query
      end
    end
  end
end
