# auto_register: false
# frozen_string_literal: true

require "core"

module Dither
  module Aspects
    module Extensions
      module Views
        # What every extension gets when it declares nothing.
        FULL_SCREEN = {
          "name" => "full",
          "label" => "Full screen",
          "shape" => "full",
          "description" => "Takes the whole screen.",
          "width" => {"min" => 200, "max" => 2_000},
          "height" => {"min" => 120, "max" => 2_000},
          "align" => %w[fill]
        }.freeze

        # What an extension says it can do, rather than what a user picked.
        #
        # An extension declares the views it can render, the shape of each one,
        # and the sizes it survives at. A layout page asks for one of them at a
        # size within those bounds; the extension does not choose, it only
        # advertises. Until that page exists the renderer asks for the first
        # declared view.
        Manifest = Data.define :views do
          def self.for(extension) = new(views: Array(Hash(extension.data)["views"]))

          def initialize views: Core::EMPTY_ARRAY
            declared = Array(views).map { View[attributes: it] }

            super(views: declared.empty? ? [View[attributes: FULL_SCREEN]] : declared)
          end

          def names = views.map(&:name)

          def supports?(name) = !find(name).nil?

          def find(name) = views.find { it.name == name }

          # Answers the requested view, or the first declared one. A request for
          # something unsupported is not an error: a layout page may know about
          # views this extension has never heard of.
          def resolve(name = nil) = find(name) || views.first

          def liquid_attributes = views.map(&:liquid_attributes)
        end
      end
    end
  end
end
