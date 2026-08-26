# frozen_string_literal: true

require "dry/monads"

module Terminus
  module Aspects
    module Scenes
      # Renders a layout plus its slot assignments into one document.
      #
      # Each slot renders the extension's design for that slot's shape, not a
      # shrunken full page one. An extension that never declared the shape is
      # refused here as well as in the composer UI, so a scene cannot be made
      # illegal by editing it through some other route - an import, a fixture,
      # a hand-written API call.
      #
      # The result is a fragment, not a whole page: TempPather wraps it in a
      # document and inlines the screen framework, the same as any other screen.
      class Composer
        include Deps[
          "aspects.extensions.generator",
          extension_repository: "repositories.extension"
        ]
        include Dry::Monads[:result]

        EMPTY_LABEL = "Empty"

        # The Liquid renderer sanitizes to a whole document, which is right for
        # a full page screen and wrong inside a slot: nesting <html> in a div is
        # invalid, and it makes the wrapper upstream think the composed scene is
        # already a complete page and skip inlining the stylesheet.
        BODY = %r{<body[^>]*>(?<content>.*)</body>}mi

        def call layout_id, assignments = {}, model_id: nil, device_id: nil
          layout = Composition.layout layout_id

          return Failure unknown_layout(layout_id) unless layout

          collect(layout, assignments, model_id:, device_id:).fmap { document_for it }
        end

        private

        def collect layout, assignments, **options
          layout.slots.reduce Success([]) do |result, slot|
            result.bind do |rendered|
              render(slot, assignments, **options).fmap { rendered + [it] }
            end
          end
        end

        def render slot, assignments, **options
          extension = resolve assignments[slot.key] || assignments[slot.key.to_sym]

          return Success placeholder_for(slot) unless extension
          return Failure undeclared(extension, slot) unless extension.supports? slot.shape_id

          generator.call(extension, shape: slot.shape_id, **options)
                   .fmap { wrap slot, fragment_for(it) }
        end

        # Assignments may carry either an extension or its id, since a stored
        # scene holds ids while a live preview already has the records.
        def resolve value
          return nil unless value
          return value if value.respond_to? :supports?

          extension_repository.find value
        end

        def fragment_for content
          content.to_s[BODY, :content] || content.to_s
        end

        def wrap slot, content
          %(<div class="slot" data-shape="#{slot.shape_id}" data-slot="#{slot.key}" ) +
            %(style="#{placement_for slot}">#{content}</div>)
        end

        # A half built scene is a real state worth seeing, so an unassigned slot
        # renders as a labelled hole rather than failing the whole composition.
        def placeholder_for slot
          %(<div class="slot slot--empty" data-shape="#{slot.shape_id}" ) +
            %(data-slot="#{slot.key}" style="#{placement_for slot}">#{EMPTY_LABEL}</div>)
        end

        def placement_for slot
          "grid-column: #{slot.grid_column}; grid-row: #{slot.grid_row}"
        end

        def document_for slots
          %(<div class="view">#{slots.join}</div>)
        end

        def unknown_layout id
          "Unknown layout: #{id.inspect}. Known layouts: #{Composition::LAYOUTS.map(&:id).join ", "}."
        end

        def undeclared extension, slot
          "#{extension.label} cannot fill the #{slot.key.tr "_", " "} slot: " \
          "it has no #{slot.shape.label.downcase} design."
        end
      end
    end
  end
end
