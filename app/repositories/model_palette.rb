# frozen_string_literal: true

module Terminus
  module Repositories
    # The model palette repository.
    class ModelPalette < DB::Repository[:model_palette]
      commands :create, delete: :by_pk

      commands update: :by_pk,
               use: :timestamps,
               plugins_options: {timestamps: {timestamps: :updated_at}}

      def all
        model_palette.order { created_at.asc }
                     .to_a
      end

      def find(id) = (model_palette.by_pk(id).one if id)

      def find_by(**) = model_palette.where(**).one

      def where(**)
        model_palette.where(**)
                     .order { created_at.asc }
                     .to_a
      end
    end
  end
end
