# frozen_string_literal: true

module Dither
  module Repositories
    # The scene repository.
    class Scene < DB::Repository[:scene]
      commands :create, delete: :by_pk

      commands update: :by_pk,
               use: :timestamps,
               plugins_options: {timestamps: {timestamps: :updated_at}}

      def all = with_associations.order { updated_at.desc }.to_a

      def find(id) = (with_associations.by_pk(id).one if id)

      def find_by(**) = with_associations.where(**).one

      def search key, value
        with_associations.where(Sequel.ilike(key, "%#{value}%")).to_a
      end

      private

      def with_associations = scene.combine :model, :scene_slots
    end
  end
end
