# frozen_string_literal: true

require "core"
require "initable"

module Dither
  module Aspects
    module Extensions
      # Answers the current value of every fact an extension declares.
      #
      # Values come from whatever the schedule last fetched. When nothing has
      # been fetched the sample stands in, so a rule can be built and read
      # before the first successful call - otherwise every trigger would look
      # broken until the extension happened to succeed once.
      class FactReader
        include Deps[exchange_repository: "repositories.extension_exchange"]
        include Initable[coalescer: proc { Dither::Aspects::Extensions::Exchanges::Coalescer }]

        def call extension
          source = data_for extension

          Dither::Facts.declared(extension)
                       .to_h { [it.key, Dither::Facts.value(source, it.path)] }
        end

        def value extension, key
          fact = Dither::Facts.find extension, key

          fact ? Dither::Facts.value(data_for(extension), fact.path) : nil
        end

        private

        def data_for extension
          fetched = coalesced extension

          fetched.any? ? fetched : extension.sample_data
        end

        def coalesced extension
          coalescer.call(exchange_repository.where(extension_id: extension.id))
                   .reject { |_key, value| Dither::Facts.blank? value }
        end
      end
    end
  end
end
