# auto_register: false
# frozen_string_literal: true

module Dither
  module Schemas
    module Designs
      # Defines import schema.
      Import = Dry::Schema.Params do
        required(:version).filled Types::Version
        required(:name).filled :string
        required(:label).filled :string
        required(:content).filled :string
      end
    end
  end
end
