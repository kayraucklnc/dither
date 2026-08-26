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
          "aspects.extensions.generators.static",
          "aspects.extensions.generators.transit"
        ]
        include Dry::Monads[:result]

        using Refinements::Hash

        # Shape says where this is being asked to render. It is also the view
        # name handed to Liquid, so an extension has two ways to support a
        # shape and the caller cannot tell them apart: write a template for it
        # under templates/, or declare it in the manifest and branch on
        # {{ view.name }} inside one template.
        #
        # Asking for a shape the extension never declared either way is a
        # failure, not a quiet fallback to the full page design. An extension
        # that was not designed for half a panel must not be shown in half one.
        #
        # Preview mode does not go out to the network first - a preview that
        # waits on a third party is a preview nobody uses - and falls back to
        # the extension's sample data when nothing has been fetched. A device
        # is never served either.
        def call extension, model_id: nil, device_id: nil, shape: nil, preview: false
          template = template_for extension, shape

          return Failure shape_failure(extension, shape) unless template

          context = contextualizer.call(extension, model_id:, device_id:, view: shape)

          process extension, context, template, preview
        end

        private

        # A shape with its own template file uses it. Otherwise the extension's
        # single template renders, provided the manifest says it can take this
        # shape at all.
        def template_for extension, shape
          return extension.template unless shape

          extension.template_for(shape) || (extension.template if extension.supports? shape)
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
            when "transit" then transit.call extension, context:, template:
            else Failure "Unsupported extension kind: #{kind}."
          end
        end
      end
    end
  end
end
