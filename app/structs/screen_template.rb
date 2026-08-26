# frozen_string_literal: true

module Dither
  module Structs
    # The screen template struct.
    class ScreenTemplate < DB::Struct
      def export_attributes = {label:, name:}

      def screen_attributes = {template_id: id, name:, label:, content:}
    end
  end
end
