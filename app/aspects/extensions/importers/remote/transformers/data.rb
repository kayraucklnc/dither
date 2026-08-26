# frozen_string_literal: true

require "core"
require "dry/monads"
require "initable"
require "refinements/hash"

module Terminus
  module Aspects
    module Extensions
      module Importers
        module Remote
          module Transformers
            # Transforms custom field defaults into data defaults.
            class Data
              include Initable[target: :fields, keys: %w[keyname default]]
              include Dry::Monads[:result]

              using Refinements::Hash

              def call attributes
                values = attributes.fetch(target, Core::EMPTY_HASH)
                                   .each
                                   .with_object({}) do |item, all|
                                     key, value = item.values_at(*keys)
                                     all[key] = value if value
                                   end

                Success attributes.merge!(data: {"values" => values}.compress)
              end
            end
          end
        end
      end
    end
  end
end
