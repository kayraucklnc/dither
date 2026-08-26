# frozen_string_literal: true

Factory.define :scene, relation: :scene do |factory|
  factory.sequence(:name) { "scene_#{it}" }
  factory.sequence(:label) { "Scene #{it}" }
  factory.layout "full"
end
