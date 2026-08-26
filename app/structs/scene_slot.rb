# frozen_string_literal: true

module Dither
  module Structs
    # The scene slot struct.
    class SceneSlot < DB::Struct
      def shape_id_for(layout) = layout.slot(slot_key)&.shape_id
    end
  end
end
