# frozen_string_literal: true

module Dither
  module Repositories
    # The scene slot repository.
    class SceneSlot < DB::Repository[:scene_slot]
      commands :create, delete: :by_pk

      def all = scene_slot.to_a

      def where(**) = scene_slot.where(**).to_a

      # Slots are replaced wholesale on save rather than diffed: a scene is
      # small, and rewriting it keeps the table matching the composer exactly
      # instead of accumulating slots from layouts that are no longer in use.
      def replace scene_id, assignments
        scene_slot.transaction do
          scene_slot.where(scene_id:).delete

          assignments.each do |slot_key, extension_id|
            next unless extension_id

            scene_slot.command(:create).call(scene_id:, slot_key: slot_key.to_s, extension_id:)
          end
        end
      end
    end
  end
end
