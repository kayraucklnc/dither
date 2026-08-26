# frozen_string_literal: true

module Terminus
  module Aspects
    module Playlists
      # Advances current item.
      class CurrentItemAdvancer
        include Deps[
          repository: "repositories.playlist",
          item_repository: "repositories.playlist_item"
        ]

        def call id, screen_id:
          playlist = find id
          playlist.automatic? ? playlist : manual_update(id, screen_id)
        end

        private

        def manual_update id, screen_id
          item_repository.find_by(playlist_id: id, screen_id:)
                         .tap { repository.update id, current_item_id: it.id }
          find id
        end

        def find(id) = repository.with_screens.by_pk(id).one
      end
    end
  end
end
