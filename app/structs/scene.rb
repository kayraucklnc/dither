# frozen_string_literal: true

module Dither
  module Structs
    # The scene struct.
    class Scene < DB::Struct
      def layout_record = Composition.layout(layout) || Composition.layout(Composition::DEFAULT_LAYOUT)

      # Slot key to extension id, which is the shape the composer and renderer
      # both want.
      def assignments
        Array(scene_slots).to_h { [it.slot_key, it.extension_id] }
      end

      def filled_count = assignments.count { |_key, id| id }

      def slot_count = layout_record.slots.size

      def complete? = filled_count == slot_count

      def summary
        "#{layout_record.label} · #{filled_count} of #{slot_count} slots filled"
      end
    end
  end
end
