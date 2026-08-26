# frozen_string_literal: true

module Terminus
  module Contracts
    module Screens
      # Defines create contract.
      class Create < Contract
        params do
          required(:screen).filled(:hash) do
            required(:model_id).filled :integer
            required(:label).filled :string
            required(:name).filled :string
            required(:image).filled Schemas::Attachment
          end
        end

        rule(screen: :image, &Rules::AttachmentSize)
      end
    end
  end
end
