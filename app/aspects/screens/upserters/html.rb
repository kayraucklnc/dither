# frozen_string_literal: true

require "dry/monads"
require "initable"

module Terminus
  module Aspects
    module Screens
      module Upserters
        # Creates screen record with image attachment from HTML content.
        class HTML
          include Deps["aspects.screens.temp_pather", repository: "repositories.screen"]
          include Initable[struct: proc { Terminus::Structs::Screen.new }]
          include Dry::Monads[:result]

          def call mold
            temp_pather.call mold do |path|
              Success repository.upsert_with_image(path, mold, struct)
            end
          end
        end
      end
    end
  end
end
