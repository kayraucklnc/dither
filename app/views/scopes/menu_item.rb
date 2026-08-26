# frozen_string_literal: true

module Dither
  module Views
    module Scopes
      # Renders menu items with automatic active state detection.
      class MenuItem < Hanami::View::Scope
        def classes = locals.fetch __method__, :link

        def data
          locals.fetch(__method__, {}).tap do |attributes|
            return attributes.merge! state: :active if root?

            attributes[:state] = :active if active?
          end
        end

        # A prefix match lights up every ancestor, so /scenes/new marked both
        # Compose and Scenes. Match the item exactly, or a path nested under it
        # by a segment boundary - never a shared prefix.
        def active?
          return false if path == "/"

          current = request.path

          current == path || current.start_with?("#{path}/")
        end

        def root? = request.path == "/" && path == "/"

        def render(path = "shared/menu_item") = super
      end
    end
  end
end
