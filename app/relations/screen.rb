# frozen_string_literal: true

module Dither
  module Relations
    # The screen relation.
    class Screen < DB::Relation
      schema :screen, infer: true do
        associations do
          belongs_to :model, relation: :model
          belongs_to :extension, relation: :extension
        end
      end
    end
  end
end
