# frozen_string_literal: true

require "core"
require "dry/monads"

module Dither
  module Aspects
    module Extensions
      module Generators
        # Uses Liquid template to render static data.
        class Static
          include Deps[renderer: "liquid.sanitize"]
          include Dry::Monads[:result]

          def call extension, context: Core::EMPTY_HASH, template: nil
            Success renderer.call(
              template || extension.template,
              context.merge("source_1" => extension.static_body)
            )
          end
        end
      end
    end
  end
end
