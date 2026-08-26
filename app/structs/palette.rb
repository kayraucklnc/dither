# frozen_string_literal: true

module Dither
  module Structs
    # The palette struct.
    class Palette < DB::Struct
      def screen_attributes = {grays:, color_codes: colors}
    end
  end
end
