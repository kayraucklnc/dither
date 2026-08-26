# frozen_string_literal: true

module Dither
  module Contracts
    module Designs
      # The contract for a design import.
      class Import < Contract
        params do
          required(:model_id).filled :integer
          required(:design).filled(:hash) { required(:attachment).filled Schemas::Attachment }
        end

        rule(design: :attachment, &Rules::AttachmentSize)
      end
    end
  end
end
