# frozen_string_literal: true

module Dither
  module Views
    module Scenes
      # The new view.
      class New < View
        expose :extensions
        expose :models
        expose :model
        # Named scene_layout, not layout: Hanami views already have a layout of
        # their own and an exposure by that name never reaches the template.
        expose :scene_layout

        expose(:layouts) { Composition::LAYOUTS }
        expose(:shapes) { Composition::SHAPES }
        expose(:grid_columns) { Composition::COLUMNS }
        expose(:grid_rows) { Composition::ROWS }
      end
    end
  end
end
