# frozen_string_literal: true

require "dry/monads"
require "refinements/hash"

module Terminus
  module Aspects
    module Extensions
      # Generates specific kind of extension.
      class Generator
        include Deps[
          "aspects.extensions.contextualizer",
          "aspects.extensions.generators.image",
          "aspects.extensions.generators.poll",
          "aspects.extensions.generators.static"
        ]
        include Dry::Monads[:result]

        using Refinements::Hash

        # Shape selects which of the extension's templates to render. Asking
        # for a shape the extension never declared is a failure rather than a
        # quiet fallback to the full page one: an extension that was not
        # designed for half a panel must not be shown in half a panel.
        def call extension, model_id: nil, device_id: nil, shape: nil
          template = template_for extension, shape

          return Failure shape_failure(extension, shape) unless template

          process extension, contextualizer.call(extension, model_id:, device_id:), template
        end

        private

        def template_for extension, shape
          shape ? extension.template_for(shape) : extension.template
        end

        def shape_failure extension, shape
          "#{extension.label} has no #{shape.inspect} design. " \
          "It supports: #{extension.shape_ids.join ", "}."
        end

        def process extension, context, template
          kind = extension.kind

          case kind
            when "image" then image.call extension, context:, template:
            when "poll" then poll.call extension, context:, template:
            when "static" then static.call extension, context:, template:
            else Failure "Unsupported extension kind: #{kind}."
          end
        end
      end
    end
  end
end
