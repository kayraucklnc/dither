# frozen_string_literal: true

require "core"
require "dry/monads"

module Dither
  module Aspects
    module Extensions
      module Generators
        # Uses Liquid template to render images.
        class Image
          include Deps[
            exchange_repository: "repositories.extension_exchange",
            renderer: "liquid.sanitize"
          ]
          include Dry::Monads[:result]

          def call extension, context: Core::EMPTY_HASH, template: nil
            exchanges = exchange_repository.where extension_id: extension.id
            template ||= extension.template

            if exchanges.one?
              content = renderer.call(
                template,
                {**context, "source_1" => {"url" => exchanges.first.template}}
              )

              Success content
            else
              render_many template, exchanges, context
            end
          end

          private

          def render_many template, exchanges, context
            data = exchanges.each.with_index(1).with_object({}) do |(exchange, index), all|
              all["source_#{index}"] = {"url" => exchange.template}
            end

            Success renderer.call(template, context.merge(data))
          end
        end
      end
    end
  end
end
