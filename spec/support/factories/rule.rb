# frozen_string_literal: true

Factory.define :rule, relation: :rule do |factory|
  factory.position 0
  factory.condition_kind "always"
  factory.settings Hash.new
end
