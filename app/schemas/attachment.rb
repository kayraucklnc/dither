# auto_register: false
# frozen_string_literal: true

module Terminus
  module Schemas
    # Defines attachment schema.
    Attachment = Dry::Schema.Params do
      required(:name).filled :string
      required(:type).filled :string
      required(:head).filled :string
      required(:filename).filled :string
      required(:tempfile).filled Types::File
    end
  end
end
