# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Extensions::Views::View do
  subject :view do
    described_class[
      attributes: {
        "name" => "commute",
        "label" => "Side rail",
        "shape" => "vertical",
        "description" => "A column beside another screen.",
        "width" => {"min" => 180, "ideal" => 264, "max" => 360},
        "height" => {"min" => 300, "ideal" => 480, "max" => 1_200},
        "align" => %w[left right]
      }
    ]
  end

  describe "#label" do
    it "answers the declared label" do
      expect(view.label).to eq("Side rail")
    end

    it "falls back to the capitalized name" do
      expect(described_class[attributes: {"name" => "bar"}].label).to eq("Bar")
    end
  end

  describe "#shape" do
    it "answers the declared shape" do
      expect(view.shape).to eq("vertical")
    end

    # A view named for its shape does not need to repeat itself.
    it "falls back to the name" do
      expect(described_class[attributes: {"name" => "overlay"}].shape).to eq("overlay")
    end
  end

  describe "#size" do
    it "answers the ideal size when nothing is asked for" do
      expect(view.size).to eq("width" => 264, "height" => 480)
    end

    it "answers what is asked for when it fits" do
      expect(view.size(width: 300, height: 600)).to eq("width" => 300, "height" => 600)
    end

    it "clamps a request that is too small" do
      expect(view.size(width: 10, height: 10)).to eq("width" => 180, "height" => 300)
    end

    it "clamps a request that is too large" do
      expect(view.size(width: 9_000, height: 9_000)).to eq("width" => 360, "height" => 1_200)
    end
  end

  describe "#liquid_attributes" do
    it "answers what a template and a layout page need" do
      expect(view.liquid_attributes).to include(
        "name" => "commute",
        "label" => "Side rail",
        "shape" => "vertical",
        "align" => %w[left right],
        "width" => {"min" => 180, "max" => 360, "ideal" => 264}
      )
    end
  end
end
