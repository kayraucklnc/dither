# frozen_string_literal: true

module Dither
  module Repositories
    # The rule repository.
    class Rule < DB::Repository[:rule]
      commands :create, delete: :by_pk

      commands update: :by_pk,
               use: :timestamps,
               plugins_options: {timestamps: {timestamps: :updated_at}}

      def all = with_associations.order { [device_id, position.asc] }.to_a

      def find(id) = (with_associations.by_pk(id).one if id)

      def for_device(device_id) = with_associations.where(device_id:).order { position.asc }.to_a

      def create_last(device_id:, **)
        rule.transaction do
          position = rule.where(device_id:).max(:position).to_i + 1

          rule.command(:create).call(device_id:, position:, **).then { find it.id }
        end
      end

      # Reordering rewrites every position in one go, because a rule's meaning
      # depends on the ones above it: a partial reorder would briefly hand a
      # panel to the wrong rule.
      def reorder device_id, ids
        rule.transaction do
          ids.each.with_index do |id, index|
            rule.by_pk(id).where(device_id:).command(:update).call(position: index)
          end
        end
      end

      private

      # The scene's slots come along too: a rule is only ever asked for so
      # that something can be rendered from it, and a scene without its slots
      # cannot be.
      def with_associations = rule.combine(scene: :scene_slots)
    end
  end
end
