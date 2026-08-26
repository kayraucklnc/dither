# frozen_string_literal: true

module Dither
  module Relations
    # The scene slot relation.
    class SceneSlot < DB::Relation
      schema :scene_slot, infer: true do
        associations do
          belongs_to :scene, relation: :scene
          belongs_to :extension, relation: :extension
        end
      end
    end
  end
end
