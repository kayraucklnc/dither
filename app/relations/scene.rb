# frozen_string_literal: true

module Dither
  module Relations
    # The scene relation.
    class Scene < DB::Relation
      schema :scene, infer: true do
        associations do
          belongs_to :model, relation: :model
          # ROM names an association after its relation unless told otherwise,
          # and reading `scene.scene_slot` as a collection is a lie.
          has_many :scene_slots, relation: :scene_slot, as: :scene_slots
          has_many :rules, relation: :rule, as: :rules
        end
      end
    end
  end
end
