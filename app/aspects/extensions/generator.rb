# frozen_string_literal: true

require "dry/monads"
require "refinements/hash"

module Dither
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
        # Preview mode does two things differently: it does not go out to the
        # network first, because a preview that waits on a third party is a
        # preview nobody uses, and it falls back to the extension's sample data
        # when nothing has been fetched yet. A device is never served either.
        def call extension, model_id: nil, device_id: nil, shape: nil, preview: false
          template = template_for extension, shape

          return Failure shape_failure(extension, shape) unless template

          context = contextualizer.call(extension, model_id:, device_id:)

          process extension, context, template, preview
        end

        private

        def template_for extension, shape
          shape ? extension.template_for(shape) : extension.template
        end

        def shape_failure extension, shape
          "#{extension.label} has no #{shape.inspect} design. " \
          "It supports: #{extension.shape_ids.join ", "}."
        end

        def process extension, context, template, preview
          kind = extension.kind

          case kind
            when "image" then image.call extension, context:, template:
            when "poll" then poll.call extension, context:, template:, preview:
            when "static" then static.call extension, context:, template:
            else Failure "Unsupported extension kind: #{kind}."
          end
        end
      end
    end
  end
end
