# auto_register: false
# frozen_string_literal: true

module Terminus
  module Aspects
    module Extensions
      module Importers
        module Local
          module Schemas
            # Defines import schema.
            Import = Dry::Schema.Params do
              required(:version).filled Types::Version
              required(:name).filled :string
              required(:label).filled :string
              required(:description).maybe :string
              required(:mode).filled :string
              required(:kind).filled :string
              required(:tags).maybe :array
              required(:static_body).maybe :hash
              required(:fields).maybe :array
              required(:data).maybe :hash
              required(:interval).maybe :integer
              required(:unit).filled :string
              required(:days).maybe :array
              required(:last_day_of_month).filled :bool
              required(:start_at).filled :date_time
              required(:exchanges).maybe(:array).each(:hash) do
                required(:headers).maybe :hash
                required(:verb).filled :string
                required(:template).filled :string
                required(:body).maybe :hash
              end
            end
          end
        end
      end
    end
  end
end
