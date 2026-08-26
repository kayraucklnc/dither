# frozen_string_literal: true

module Terminus
  module Contracts
    module Extensions
      module Imports
        # The contract for an extension import.
        class Create < Contract
          params do
            required(:extension).filled(:hash) do
              required(:attachment).filled Schemas::Attachment
            end
          end

          rule(extension: :attachment, &Rules::AttachmentSize)
        end
      end
    end
  end
end
