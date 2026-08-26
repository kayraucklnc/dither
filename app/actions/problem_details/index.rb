# frozen_string_literal: true

module Dither
  module Actions
    module ProblemDetails
      # The index action.
      class Index < Action
        def handle(_request, response) = response.render view
      end
    end
  end
end
