# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Scenes::Composer, :db do
  subject(:composer) { described_class.new }

  let(:extension) { Factory[:extension, template: "<p>full</p>"] }

  describe "#call" do
    it "answers failure for an unknown layout" do
      expect(composer.call("nonsense")).to be_failure
    end

    it "places an extension in a slot whose shape it declares" do
      result = composer.call "full", {"main" => extension}

      expect(result.value!).to include %(data-shape="full")
    end

    it "refuses an extension in a shape it never declared" do
      result = composer.call "quadrants", {"top_left" => extension}

      expect(result.failure).to match(/no quarter design/)
    end

    it "renders each slot with its grid placement" do
      wide = Factory[:extension, template: "<p>full</p>",
                     variants: {"half_width" => "<p>half</p>"}]
      result = composer.call "split_vertical", {"left" => wide, "right" => wide}

      expect(result.value!).to include("grid-column: 1 / span 3")
                           .and include("grid-column: 4 / span 3")
    end

    it "labels an unassigned slot rather than failing" do
      result = composer.call "split_vertical"

      expect(result.value!).to include "slot--empty"
    end

    it "unwraps the document the liquid renderer produces" do
      result = composer.call "full", {"main" => extension}

      expect(result.value!).not_to include "<html"
    end

    it "resolves an extension passed by id" do
      result = composer.call "full", {"main" => extension.id}

      expect(result.value!).to include "full"
    end
  end
end
