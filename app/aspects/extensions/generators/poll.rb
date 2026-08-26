# frozen_string_literal: true

require "core"
require "dry/monads"
require "initable"

module Dither
  module Aspects
    module Extensions
      module Generators
        # Uses Liquid template to render poll data.
        class Poll
          include Deps[
            "aspects.extensions.exchanges.refresher",
            exchange_repository: "repositories.extension_exchange",
            renderer: "liquid.sanitize"
          ]
          include Dry::Monads[:result]
          include Initable[coalescer: proc { Dither::Aspects::Extensions::Exchanges::Coalescer }]

          def call extension, context: Core::EMPTY_HASH, template: nil, preview: false
            # A preview renders from whatever the schedule last fetched. Going
            # to the network here would put a third party's latency, and its
            # outages, in the middle of dragging a block around.
            refresh extension.id unless preview
            render extension, context, template || extension.template, preview
          end

          private

          def refresh extension_id
            exchange_repository.where(extension_id:).each { refresher.call it }
          end

          def render extension, context, template, preview
            exchanges = exchange_repository.where extension_id: extension.id
            data = coalescer.call exchanges
            data = extension.sample_data if preview && empty?(data)

            Success renderer.call(template, context.merge(data))
          end

          # An exchange that has never succeeded still answers a key, so the
          # hash being present is not the same as it holding anything.
          def empty?(data) = data.values.all? { |value| value.nil? || value.respond_to?(:empty?) && value.empty? }
        end
      end
    end
  end
end
