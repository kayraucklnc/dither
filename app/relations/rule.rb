# frozen_string_literal: true

module Dither
  module Relations
    # The rule relation.
    class Rule < DB::Relation
      schema :rule, infer: true do
        associations do
          belongs_to :device, relation: :device
          belongs_to :scene, relation: :scene
        end
      end

      def ordered = order :position, :id
    end
  end
end
