# auto_register: false
# frozen_string_literal: true

require "core"

module Dither
  module Aspects
    module Extensions
      module Views
        # One declared view: a name, the sizes it survives at, and where it can sit.
        View = Data.define :attributes do
          def initialize attributes: Core::EMPTY_HASH
            super(attributes: Hash(attributes))
          end

          def name = attributes["name"].to_s

          def label = attributes["label"] || name.capitalize

          # The form factor, not a position: full, horizontal, vertical, overlay.
          # Position is what "align" offers, and the layout page picks from it.
          def shape = attributes["shape"] || name

          def align = Array attributes["align"]

          def width = bounds "width"

          def height = bounds "height"

          # Answers a concrete size for this view, clamped to what it declares.
          def size width: nil, height: nil
            {"width" => clamp(width, self.width), "height" => clamp(height, self.height)}
          end

          def liquid_attributes
            {
              "name" => name,
              "label" => label,
              "shape" => shape,
              "description" => attributes["description"],
              "width" => width,
              "height" => height,
              "align" => align
            }
          end

          private

          def bounds key
            values = Hash attributes[key]

            {"min" => values["min"], "max" => values["max"], "ideal" => values["ideal"]}
          end

          def clamp value, limits
            ideal, low, high = limits.values_at "ideal", "min", "max"
            chosen = value || ideal || low
            return chosen unless chosen && low && high

            chosen.clamp low, high
          end
        end
      end
    end
  end
end
