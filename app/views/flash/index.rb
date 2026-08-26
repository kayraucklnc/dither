# frozen_string_literal: true

module Terminus
  module Views
    module Flash
      # The index view.
      class Index < View
        expose :images do
          Pathname("public/downloads").glob("*.bin")
                                      .sort
                                      .map do |path|
            {
              name: path.basename.to_s,
              path: "/downloads/#{path.basename}"
            }
          end
        end
      end
    end
  end
end
