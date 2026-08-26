# frozen_string_literal: true

require "core"
require "dry/monads"

module Terminus
  module Aspects
    module Extensions
      module Generators
        # Uses a Liquid template to render a public transport departure board.
        #
        # Unlike a poll extension, there are no exchanges: the settings name a
        # country, city, and provider, and the provider knows how to answer.
        class Transit
          include Deps["aspects.transit.finder", renderer: "liquid.sanitize"]
          include Dry::Monads[:result]

          def call extension, context: Core::EMPTY_HASH
            finder.call(settings_for(extension))
                  .fmap { render extension, context, it }
          end

          private

          def render extension, context, board
            renderer.call extension.template, context.merge("transit" => board.liquid_attributes)
          end

          # Field defaults supply the shape; data values override them. This is
          # the same resolution the Liquid "extension.values" key uses, so a
          # transit extension stays editable through the ordinary fields UI.
          def settings_for extension
            defaults = Hash extension.liquid_attributes["values"]
            overrides = Hash Hash(extension.data)["values"]

            defaults.merge overrides
          end
        end
      end
    end
  end
end
