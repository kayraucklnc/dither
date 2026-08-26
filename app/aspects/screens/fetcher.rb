# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Screens
      # Fetches a device's current screen.
      class Fetcher
        include Deps[
          "aspects.screens.interrupts.sleep",
          "aspects.scenes.resolver",
          "aspects.scenes.publisher",
          rule_repository: "repositories.rule",
          playlist_repository: "repositories.playlist",
          playlist_item_repository: "repositories.playlist_item"
        ]
        include Dry::Monads[:result]

        def call device
          return sleep.call device if device.asleep?
          return from_rules device if rules? device

          from_playlist device
        end

        private

        # Rules are the model going forward; playlists remain for devices that
        # have not been moved across yet, so upgrading does not blank a panel.
        def rules?(device) = rule_repository.for_device(device.id).any?

        def from_rules device
          resolver.call(device)
                  .bind { |decision| publisher.call decision.scene, device: }
        end

        def from_playlist device
          find_playlist(device.playlist_id).bind { |playlist| find_current_item playlist }
                                           .fmap(&:screen)
        end

        def find_playlist id
          playlist = playlist_repository.find id

          return Success playlist if playlist

          Failure "Unable to fetch screen. Can't find playlist with ID: #{id.inspect}."
        end

        def find_current_item playlist
          id = playlist.current_item_id
          item = playlist_item_repository.find id

          return Success item if item

          Failure "Unable to fetch screen. Can't find current playlist item with ID: #{id.inspect}."
        end
      end
    end
  end
end
