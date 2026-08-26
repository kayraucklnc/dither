# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Variants do
  describe ".call" do
    it "collects a known shape" do
      result = described_class.call "templates/half_width.html.liquid" => "<p>x</p>"

      expect(result.variants).to eq("half_width" => "<p>x</p>")
    end

    it "ignores files outside the templates directory" do
      result = described_class.call "template.html.liquid" => "<p>x</p>",
                                    "configuration.yml" => "name: x"

      expect(result.variants).to be_empty
    end

    it "reports an unknown shape rather than dropping it" do
      result = described_class.call "templates/three_quarters.html.liquid" => "<p>x</p>"

      expect(result.problems.first).to match(/unknown shape/)
    end

    it "reports a full page variant in the wrong place" do
      result = described_class.call "templates/full.html.liquid" => "<p>x</p>"

      expect(result.problems.first).to match(/belongs in template/)
    end

    it "reports an empty variant" do
      result = described_class.call "templates/quarter.html.liquid" => "   "

      expect(result.problems.first).to match(/empty/)
    end

    it "orders variants by the vocabulary, not by input" do
      result = described_class.call "templates/quarter.html.liquid" => "q",
                                    "templates/half_width.html.liquid" => "h"

      expect(result.variants.keys).to eq %w[half_width quarter]
    end

    it "round trips back to zip entries" do
      entries = described_class.entries_for "quarter" => "q"

      expect(entries).to eq("templates/quarter.html.liquid" => "q")
    end
  end
end
