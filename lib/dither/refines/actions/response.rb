# frozen_string_literal: true

module Dither
  module Refines
    module Actions
      # Modifies and enhances default Hanami action response behavior.
      module Response
        refine Hanami::Action::Response do
          def with body:, format: nil, status: 200
            @body = [body]
            @status = status

            self.format = format if format
            self
          end
        end
      end
    end
  end
end
