# frozen_string_literal: true

module Dither
  module Views
    module Extensions
      module Exchanges
        # The index view.
        class Index < View
          expose :extension
          decorate :exchanges
        end
      end
    end
  end
end
