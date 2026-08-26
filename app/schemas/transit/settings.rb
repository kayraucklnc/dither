# auto_register: false
# frozen_string_literal: true

module Dither
  module Schemas
    module Transit
      # Defines the settings an extension supplies to a transit provider.
      #
      # These arrive as +extension.data["values"]+, which is the same place the
      # generic custom field UI writes to, so a transit extension stays
      # configurable by hand until a richer form lands.
      Settings = Dry::Schema.Params do
        required(:origin).filled :string

        optional(:country).filled :string
        optional(:city).filled :string
        optional(:provider).filled :string
        optional(:destination).maybe :string
        optional(:lead_time).filled :integer, gteq?: 0, lteq?: 720
        optional(:limit).filled :integer, gteq?: 1, lteq?: 20
        optional(:transfers).filled :integer, gteq?: 0, lteq?: 5
        optional(:language).filled included_in?: %w[en it]
        optional(:title).maybe :string
        optional(:show_platform).filled :bool
        optional(:hide_cancelled).filled :bool
      end
    end
  end
end
