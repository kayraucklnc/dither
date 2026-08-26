# frozen_string_literal: true

module Terminus
  module Contracts
    module Screens
      # Defines update contract.
      class Update < Contract
        params do
          required(:id).filled :integer

          required(:screen).filled(:hash) do
            required(:model_id).filled :integer
            required(:label).filled :string
            required(:name).filled :string
            optional(:image).filled Schemas::Attachment
          end
        end

        rule(screen: :image, &Rules::AttachmentSize)
      end
    end
  end
end
